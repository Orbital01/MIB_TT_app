const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const os = require('os');
const diskinfo = require('node-disk-info');
const yauzl = require('yauzl');
const sudoPrompt = require('sudo-prompt');

// Keep a global reference of the window object
let mainWindow;

// Enable live reload for development
if (process.argv.includes('--dev')) {
    require('electron-reload')(__dirname, {
        electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
        hardResetMethod: 'exit'
    });
}

function createWindow() {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 900,
        height: 1000,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'renderer', 'preload.js')
        },
        icon: path.join(__dirname, 'assets', 'icon.png'),
        title: 'MIB SD Card Formatter',
        resizable: true,
        minWidth: 800,
        minHeight: 1000
    });

    // Load the app
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    // Open DevTools in development
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    // Emitted when the window is closed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(createWindow);

// Quit when all windows are closed
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// IPC Handlers

// Get available drives
ipcMain.handle('get-drives', async () => {
    try {
        const drives = await diskinfo.getDiskInfo();

        // Filter for removable/external drives
        const filteredDrives = drives.filter(drive => {
            // For macOS specifically
            if (os.platform() === 'darwin') {
                // Check if it's mounted under /Volumes/ but not the main disk
                return drive.mounted.includes('/Volumes/') &&
                    !drive.filesystem.includes('/dev/disk1');
            }
            // For Windows
            else if (os.platform() === 'win32') {
                // Add detailed logging of all drive properties
                console.log('Drive detection - Full drive object:', JSON.stringify(drive, null, 2));
                console.log(`Drive ${drive.mounted}: Type=${drive.driveType}, FS=${drive.filesystem}`);

                // More flexible detection logic
                return (
                    drive.mounted &&
                    drive.mounted.match(/^[A-Z]:\\$/) && // Valid drive letter format
                    (
                        // Check multiple conditions that might indicate a removable drive
                        (typeof drive.driveType === 'string' && drive.driveType.includes('Removable')) ||
                        (typeof drive.driveType === 'number' && drive.driveType === 2) || // 2 is numeric code for removable
                        // Alternative detection when drive type isn't properly reported
                        (drive.mounted.charAt(0) !== 'C')
                    )
                );
            }
            // For other Unix systems
            else {
                const mountPoint = drive.mounted.toLowerCase();
                return mountPoint.includes('media') ||
                    mountPoint.includes('mnt') ||
                    mountPoint.includes('volumes') ||
                    mountPoint.includes('usb');
            }
        });

        console.log('All drives:', drives);
        console.log('Filtered drives:', filteredDrives);

        return filteredDrives.map(drive => ({
            device: drive.filesystem,
            mountPoint: drive.mounted,
            label: drive.label || 'Unlabeled',
            size: drive.blocks,
            available: drive.available,
            used: drive.used,
            filesystem: drive.filesystem
        }));
    } catch (error) {
        console.error('Error getting drives:', error);
        return [];
    }
});

// Use predefined M.I.B package instead of letting user select archive
ipcMain.handle('select-archive', async () => {
    // Path to the predefined M.I.B package
    const mibPackagePath = path.join(__dirname, 'assets', 'packages', 'M.I.B.zip');

    // Verify the package exists
    if (fs.existsSync(mibPackagePath)) {
        return mibPackagePath;
    } else {
        // If package is missing, show error dialog
        await dialog.showMessageBox(mainWindow, {
            type: 'error',
            title: 'Errore',
            message: 'Pacchetto M.I.B predefinito non trovato!'
        });
        return null;
    }
});

// Get files from archive
ipcMain.handle('get-archive-files', async (event, archivePath) => {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(archivePath)) {
            reject(new Error('Archivio non trovato'));
            return;
        }

        yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
            if (err) {
                reject(err);
                return;
            }

            const files = [];

            zipfile.readEntry();
            zipfile.on('entry', (entry) => {
                if (!/\/$/.test(entry.fileName)) {
                    // È un file, non una directory
                    files.push({
                        name: entry.fileName,
                        size: entry.uncompressedSize,
                        compressedSize: entry.compressedSize
                    });
                }
                zipfile.readEntry();
            });

            zipfile.on('end', () => {
                resolve(files);
            });

            zipfile.on('error', (err) => {
                reject(err);
            });
        });
    });
});

// Format SD Card
// Format SD Card
ipcMain.handle('format-sd-card', async (event, options) => {
    const { drivePath, label } = options;

    return new Promise((resolve, reject) => {
        let command;

        if (os.platform() === 'win32') {
            // Windows: usa format command - sempre formattazione completa (no /q)
            command = `format ${drivePath} /fs:FAT32 /v:${label} /y`;

            // Su Windows potrebbe servire eseguire come amministratore
            const sudoOptions = {
                name: 'SD Card Formatter',
                icns: path.join(__dirname, 'assets', 'icon.icns'),
            };

            sudoPrompt.exec(command, sudoOptions, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`${error.message}\n${stderr}`));
                } else {
                    resolve({ success: true, output: stdout });
                }
            });

        } else  if (os.platform() === 'darwin') {
            // Convert /dev/disk4s1 to /dev/disk4 for macOS
            const wholeDiskPath = drivePath.replace(/s[0-9]+$/, '');
            command = `diskutil eraseDisk FAT32 ${label} ${wholeDiskPath}`;

            console.log(`Formatting whole disk: ${wholeDiskPath} (was: ${drivePath})`);

            const sudoOptions = {
                name: 'SD Card Formatter'
            };

            sudoPrompt.exec(command, sudoOptions, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`${error.message}\n${stderr}`));
                } else {
                    resolve({ success: true, output: stdout });
                }
            });

        } else {
            // Linux: usa mkfs.vfat
            command = `mkfs.vfat -F 32 -n ${label} ${drivePath}`;

            const sudoOptions = {
                name: 'SD Card Formatter'
            };

            sudoPrompt.exec(command, sudoOptions, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`${error.message}\n${stderr}`));
                } else {
                    resolve({ success: true, output: stdout });
                }
            });
        }
    });
});

// Copy file from archive to SD card
ipcMain.handle('copy-file-to-sd', async (event, options) => {
    const { targetPath } = options;
    const appRootPath = app.getAppPath();
    const archivePath = path.join(appRootPath, 'assets', 'packages', 'M.I.B.zip');

    return new Promise((resolve, reject) => {
        if (!fs.existsSync(archivePath)) {
            reject(new Error(`ZIP file not found: ${archivePath}`));
            return;
        }

        yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
            if (err) {
                reject(err);
                return;
            }

            let extractedFiles = 0;
            // Track all entries to detect common root directory
            const entries = [];

            // First pass to collect all entries
            zipfile.readEntry();
            zipfile.on('entry', (entry) => {
                entries.push(entry.fileName);
                zipfile.readEntry();
            });

            // When all entries are collected
            zipfile.on('end', () => {
                // Detect if there's a common root directory
                let rootDir = '';
                if (entries.length > 0) {
                    const firstEntry = entries[0].split('/')[0];
                    if (entries.every(entry => entry.startsWith(firstEntry + '/'))) {
                        rootDir = firstEntry + '/';
                    }
                }

                // Second pass to extract files
                yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile2) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    zipfile2.readEntry();
                    zipfile2.on('entry', (entry) => {
                        // Skip the root directory itself and hidden files
                        if (entry.fileName === rootDir ||
                            entry.fileName.startsWith('__MACOSX') ||
                            entry.fileName.startsWith('.') ||
                            path.basename(entry.fileName).startsWith('.')) {
                            zipfile2.readEntry();
                            return;
                        }

                        // Remove root directory from path if it exists
                        const relativePath = entry.fileName.startsWith(rootDir)
                            ? entry.fileName.substring(rootDir.length)
                            : entry.fileName;

                        // Skip directories but create them
                        if (/\/$/.test(relativePath)) {
                            const dirPath = path.join(targetPath, relativePath);
                            fs.mkdirSync(dirPath, { recursive: true });
                            zipfile2.readEntry();
                            return;
                        }

                        // Create output directories and extract file
                        const outputPath = path.join(targetPath, relativePath);
                        const outputDir = path.dirname(outputPath);
                        fs.mkdirSync(outputDir, { recursive: true });

                        zipfile2.openReadStream(entry, (err, readStream) => {
                            if (err) {
                                reject(err);
                                return;
                            }

                            const writeStream = fs.createWriteStream(outputPath);
                            readStream.pipe(writeStream);

                            writeStream.on('close', () => {
                                extractedFiles++;
                                zipfile2.readEntry();
                            });

                            writeStream.on('error', (err) => {
                                reject(err);
                            });
                        });
                    });

                    zipfile2.on('end', () => {
                        if (extractedFiles > 0) {
                            resolve({
                                success: true,
                                outputPath: targetPath,
                                fileCount: extractedFiles
                            });
                        } else {
                            reject(new Error('Nessun file valido trovato nell\'archivio'));
                        }
                    });

                    zipfile2.on('error', (err) => {
                        reject(err);
                    });
                });
            });
        });
    });
});

// Show message box
ipcMain.handle('show-message-box', async (event, options) => {
    const result = await dialog.showMessageBox(mainWindow, options);
    return result;
});