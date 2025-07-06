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

    let iconPath;
    if (process.platform === 'win32') {
        iconPath = path.join(__dirname, 'assets/logo.ico');
    } else if (process.platform === 'darwin') {
        iconPath = path.join(__dirname, 'assets/logo.icns');
    } else {
        iconPath = path.join(__dirname, 'assets/logo.png');
    }

    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 900,
        height: 1100,
        icon: iconPath,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'renderer', 'preload.js')
        },
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
// Get available drives - FIXED VERSION
ipcMain.handle('get-drives', async () => {
    const platform = os.platform();

    try {
        const drives = await diskinfo.getDiskInfo();

        const filteredDrives = drives.filter(drive => {
            const mount = (drive.mounted || '').toLowerCase();
            
            if (platform === 'win32') {
                // Escludi il disco C dalla lista
                const isNonSystemDrive = mount && !mount.toLowerCase().startsWith('c:');
                return isNonSystemDrive;
            }

            if (platform === 'darwin') {
                // Su macOS: includi solo volumi in /Volumes escluso il disco principale
                return (
                    mount.startsWith('/volumes/')
                );
            }

            // Linux o altri Unix
            return (
                mount.includes('/media/') ||
                mount.includes('/mnt/') ||
                mount.includes('/run/media/') ||
                mount.includes('/volumes/') ||
                mount.includes('usb')
            );
        });

        console.log('Tutti i drive:', drives);
        console.log('Drive filtrati:', filteredDrives);

        // Debug aggiuntivo per Windows
        if (platform === 'win32') {
            console.log('Debug Windows drives:');
            drives.forEach(drive => {
                console.log(`Drive: ${drive.mounted}, Description: ${drive.description}, Filesystem: ${drive.filesystem}, Size: ${drive.blocks}`);
            });
        }

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
        console.error('Errore durante il rilevamento dei drive:', error);
        return [];
    }
});

// Use predefined M.I.B package instead of letting user select archive
    ipcMain.handle('select-archive', async () => {
        // Path to the predefined M.I.B package
        const mibPackagePath = path.join(__dirname, 'assets', 'packages', 'M.I.B');

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

            yauzl.open(archivePath, {lazyEntries: true}, (err, zipfile) => {
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
    ipcMain.handle('format-sd-card', async (event, options) => {
        const {drivePath, label} = options;

        return new Promise((resolve, reject) => {
            let command;

            if (os.platform() === 'win32') {
                // Windows: usa format command - sempre formattazione completa (no /q)

                command = `echo.|format ${drivePath} /fs:FAT32 /v:${label}`;
                console.log(command);


                // Su Windows potrebbe servire eseguire come amministratore
                const sudoOptions = {
                    name: 'SD Card Formatter',
                    icns: path.join(__dirname, 'assets', 'icon.icns'),
                };

                sudoPrompt.exec(command, sudoOptions, (error, stdout, stderr) => {
                    if (error) {
                        reject(new Error(`${error.message}\n${stderr}`));
                    } else {
                        resolve({success: true, output: stdout});
                    }
                });

            } else if (os.platform() === 'darwin') {
                // Convert /dev/disk4s1 to /dev/disk4 for macOS
                const wholeDiskPath = drivePath.replace(/s[0-9]+$/, '');
                command = `diskutil eraseVolume FAT32 ${label} ${wholeDiskPath}`;

                console.log(`Formatting whole disk: ${wholeDiskPath} (was: ${drivePath})`);

                const sudoOptions = {
                    name: 'SD Card Formatter'
                };

                sudoPrompt.exec(command, sudoOptions, (error, stdout, stderr) => {
                    if (error) {
                        reject(new Error(`${error.message}\n${stderr}`));
                    } else {
                        resolve({success: true, output: stdout});
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
                        resolve({success: true, output: stdout});
                    }
                });
            }
        });
    });

// Copy all files from resources to SD card
const fsExtra = require('fs-extra');

ipcMain.handle('copy-file-to-sd', async (event, options) => {
    const { targetPath } = options;

    // Percorso sorgente
    const sourcePath = app.isPackaged
        ? path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', 'packages', 'M.I.B')
        : path.join(app.getAppPath(), 'assets', 'packages', 'M.I.B');

    try {
        // Leggi contenuto cartella sorgente
        const items = await fsExtra.readdir(sourcePath);

        // Copia ogni elemento nella destinazione
        for (const item of items) {
            await fsExtra.copy(
                path.join(sourcePath, item),
                path.join(targetPath, item),
                { overwrite: true }
            );
        }

        return { success: true, fileCount: items.length };

    } catch (err) {
        throw new Error(`Errore copia: ${err.message}`);
    }
});

// Handler aggiuntivo per ottenere informazioni sulla cartella sorgente
ipcMain.handle('get-source-info', async (event) => {
    const appRootPath = app.getAppPath();
    const sourcePath = path.join(appRootPath, 'assets', 'packages', 'M.I.B');
    
    try {
        if (!fs.existsSync(sourcePath)) {
            return { exists: false, path: sourcePath };
        }
        
        const stats = await fsExtra.stat(sourcePath);
        const files = await fsExtra.readdir(sourcePath);
        
        return {
            exists: true,
            path: sourcePath,
            isDirectory: stats.isDirectory(),
            fileCount: files.length,
            size: stats.size
        };
    } catch (err) {
        return { exists: false, path: sourcePath, error: err.message };
    }
});


// Show message box
    ipcMain.handle('show-message-box', async (event, options) => {
        const result = await dialog.showMessageBox(mainWindow, options);
        return result;
    });