// Main application class
class SDFormatterApp {
    constructor() {
        this.selectedDrive = null;
        this.selectedFile = null;
        this.archivePath = null;
        this.availableFiles = [];

        // Show loading screen
        this.loadingOverlay = document.getElementById('loadingOverlay');

        this.initializeElements();
        this.bindEvents();
        this.refreshDrives();

        // Initialize app with loading screen
        setTimeout(() => {
            this.refreshDrives();
            this.hideLoadingScreen();
        }, 1500);  // Show loading screen for 1.5 seconds


        this.log('Applicazione inizializzata');
    }

    initializeElements() {
        // Drive elements
        this.driveSelect = document.getElementById('driveSelect');
        this.refreshDrivesBtn = document.getElementById('refreshDrives');
        this.driveInfo = document.getElementById('driveInfo');
        // Options elements
        this.volumeLabel = document.getElementById('volumeLabel');
        this.quickFormat = document.getElementById('quickFormat');

        // Action buttons
        this.formatAndCopyBtn = document.getElementById('bottone');

        // Progress elements
        this.progressSection = document.getElementById('progressSection');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');

        // Log elements
        this.logOutput = document.getElementById('logOutput');
        this.clearLogBtn = document.getElementById('clearLog');

        // Activation elements
        this.activateBtn = document.getElementById('activateBtn');
        this.activationMessage = document.getElementById('activationMessage');
        this.activationUsername = document.getElementById('activationUsername');
        this.activationError = document.getElementById('activationError');
    }

    bindEvents() {

        document.addEventListener('show-activation', () => {
            const modal = document.getElementById('activationModal');
            modal.classList.add('show');
            modal.style.display = 'block'; // Make sure it's visible

            console.log('Activation modal should be visible now');
        });

        // Drive events
        this.driveSelect.addEventListener('change', () => this.onDriveSelect());
        this.refreshDrivesBtn.addEventListener('click', () => this.refreshDrives());

        // Log events
        //this.clearLogBtn.addEventListener('click', () => this.clearLog());


        this.formatAndCopyBtn.addEventListener('click', () => {
            console.log('Format and Copy button clicked');
            this.log('Format and Copy button clicked');
            this.formatAndCopy();
        });

        this.activateBtn.addEventListener('click', async () => {
            console.log('Activation button clicked');

            const chiave = this.activationMessage.value;
            const username = this.activationUsername.value;

            if (!chiave || !username) {
                this.activationError.innerText = 'Inserisci sia username che chiave';
                return;
            }

            try {
                await this.verifyHash(chiave, username);
            } catch (error) {
                this.activationError.innerText = "Errore durante l'attivazione:" + error.message;
            }
        });
    }

    async refreshDrives() {
        try {
            this.log('Ricerca drive in corso...');

            const drives = await window.electronAPI.getDrives();

            // Clear existing options
            this.driveSelect.innerHTML = '<option value="">Seleziona un drive...</option>';

            drives.forEach((drive, index) => {
                const displayName = drive.mountPoint;
                const option = document.createElement('option');
                option.value = index;
                option.textContent = `${displayName}`;
                option.dataset.drive = JSON.stringify(drive);
                this.driveSelect.appendChild(option);
            });

            this.log(`Trovati ${drives.length} drive disponibili`);

            if (drives.length === 0) {
                this.log('⚠️ Nessun drive esterno rilevato. Assicurati che la SD card sia inserita.');
            }

        } catch (error) {
            this.logError('Errore durante il rilevamento dei drive', error);
        }
    }

    onDriveSelect() {
        const selectedIndex = this.driveSelect.value;

        if (selectedIndex === '') {
            this.driveInfo.classList.add('hidden');
            this.selectedDrive = null;
            this.updateButtonStates();
            return;
        }

        const selectedOption = this.driveSelect.options[this.driveSelect.selectedIndex];
        this.selectedDrive = JSON.parse(selectedOption.dataset.drive);

       // this.log(`Drive selezionato: ${this.selectedDrive.device}`);

        this.updateButtonStates();

    }

    async browseArchive() {
        try {
            const archivePath = await window.electronAPI.selectArchive();

            if (archivePath) {
                this.archivePath = archivePath;
                this.archiveInput.value = archivePath;

                await this.loadArchiveFiles();
                this.log(`Archivio selezionato: ${archivePath}`);
            }

        } catch (error) {
            this.logError('Errore durante la selezione dell\'archivio', error);
        }
    }

    async loadArchiveFiles() {
        if (!this.archivePath) return;

        try {
            this.availableFiles = await window.electronAPI.getArchiveFiles(this.archivePath);

            // Clear existing files
            this.filesListContainer.innerHTML = '';

            if (this.availableFiles.length === 0) {
                this.filesListContainer.innerHTML = '<div class="file-item">Nessun file trovato nell\'archivio</div>';
                this.filesList.classList.remove('hidden');
                return;
            }

            // Create file items
            this.availableFiles.forEach((file, index) => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                fileItem.dataset.fileIndex = index;

                fileItem.innerHTML = `
                    <div class="file-name">📄 ${file.name}</div>
                    <div class="file-size">${this.formatBytes(file.size)}</div>
                `;

                fileItem.addEventListener('click', () => this.selectFile(index));

                this.filesListContainer.appendChild(fileItem);
            });

            this.filesList.classList.remove('hidden');
            this.log(`Caricati ${this.availableFiles.length} file dall'archivio`);

        } catch (error) {
            this.logError('Errore durante il caricamento dei file dall\'archivio', error);
        }
    }

    selectFile(index) {
        // Remove previous selection
        document.querySelectorAll('.file-item').forEach(item => {
            item.classList.remove('selected');
        });

        // Select new file
        const fileItem = document.querySelector(`[data-file-index="${index}"]`);
        fileItem.classList.add('selected');

        this.selectedFile = this.availableFiles[index];
        this.updateButtonStates();

        this.log(`File selezionato: ${this.selectedFile.name}`);
    }

    updateButtonStates() {
        const hasDrive = this.selectedDrive !== null;
        if (hasDrive) {
            this.log(`Drive selezionato: ${this.selectedDrive.mountPoint}`);
            this.formatAndCopyBtn.disabled = false;
            this.formatAndCopyBtn.classList.remove('disabled');
        }
        this.log('You can now proceed. Click the button!', hasDrive);
    }

    async formatAndCopy() {

        if (!this.selectedDrive) {
            this.showError('Seleziona un drive');
            return;
        }

        const confirmed = await this.confirmDangerousAction(
            'Conferma Formattazione e Copia',
            `Formattare ${this.selectedDrive.mountPoint} e copiare M.I.B?\n\n⚠️ TUTTI I DATI VERRANNO PERSI DEFINITIVAMENTE!`
        );

        if (!confirmed) return;

        await this.performFormat();

    }

    async performFormat() {
        try {
            this.showProgress('Formattazione in corso...', 0);

            const options = {
                drivePath: this.selectedDrive.mountPoint,
                label:'SD_CARD',
            };

            this.log(`🔧 Inizio formattazione di ${options.drivePath}...`);
            this.updateProgress(25);

            const result = await window.electronAPI.formatSDCard(options);

            if (result.success) {
                this.updateProgress(100);
                this.log('✅ Formattazione completata con successo!');
                this.showSuccess('SD Card formattata correttamente!');

                // Call copy process inside the try block after successful formatting
                await this.performCopy();

            } else {
                throw new Error('Formattazione fallita');
            }

        } catch (error) {
            this.logError('❌ Errore durante la formattazione', error);
            this.showError(`Errore durante la formattazione:\n${error.message}`);
        } finally {
            this.hideProgress();
        }

    }

    async performCopy() {
        try {
            this.showProgress('Copia file in corso...', 0);

            const options = {
                targetPath: this.selectedDrive.mountPoint
            };

            this.log(`📋 Copia in corso...`);
            this.updateProgress(25);

            await this.sleep(1000); // Simulate progress
            this.updateProgress(75);

            const result = await window.electronAPI.copyFileToSD(options);

            if (result.success) {
                this.updateProgress(100);
                this.log(`✅ File copiato con successo in: ${result.outputPath}`);
                this.showSuccess(`File copiato correttamente!`);
            } else {
                throw new Error('Copia fallita');
            }

        } catch (error) {
            this.logError('❌ Errore durante la copia', error);
            this.showError(`Errore durante la copia:\n${error.message}`);
        } finally {
            this.hideProgress();
        }
    }

    // UI Helper Methods
    showProgress(text, percentage = 0) {
        this.progressSection.style.display = 'block';
        this.progressText.textContent = text;
        this.progressFill.style.width = `${percentage}%`;
    }

    updateProgress(percentage) {
        this.progressFill.style.width = `${percentage}%`;
    }

    hideProgress() {
        this.progressSection.style.display = 'none';
    }

    async confirmDangerousAction(title, message) {
        const result = await window.electronAPI.showMessageBox({
            type: 'warning',
            buttons: ['Annulla', 'Procedi'],
            defaultId: 0,
            title: title,
            message: message
        });

        return result.response === 1;
    }

    async showSuccess(message) {
        await window.electronAPI.showMessageBox({
            type: 'info',
            buttons: ['OK'],
            title: 'Operazione Completata',
            message: message
        });
    }

    async showError(message) {
        await window.electronAPI.showMessageBox({
            type: 'error',
            buttons: ['OK'],
            title: 'Errore',
            message: message
        });
    }

    // Utility Methods
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getCurrentTimestamp() {
        return new Date().toLocaleTimeString('it-IT');
    }

    log(message) {
        const timestamp = this.getCurrentTimestamp();
        const logLine = `[${timestamp}] ${message}\n`;
        this.logOutput.textContent += logLine;
        this.logOutput.scrollTop = this.logOutput.scrollHeight;
        console.log(message);
    }

    logError(message, error) {
        const timestamp = this.getCurrentTimestamp();
        const errorDetails = error ? ` - ${error.message}` : '';
        const logLine = `[${timestamp}] ❌ ${message}${errorDetails}\n`;
        this.logOutput.textContent += logLine;
        this.logOutput.scrollTop = this.logOutput.scrollHeight;
        console.error(message, error);
    }

    clearLog() {
        this.logOutput.textContent = '';
        this.log('Log pulito');
    }

    hideLoadingScreen() {
        if (this.loadingOverlay) {
            this.loadingOverlay.style.opacity = '0';
            setTimeout(() => {
                this.loadingOverlay.style.display = 'none';
            }, 500);
        }
    }

    async verifyHash(message, username) {
        try {
            // Assicuriamoci che i parametri siano definiti
            if (!message || !username) {
                return { success: false, error: "Username e chiave sono richiesti" };
            }

            // Passiamo i parametri come oggetto come previsto nel main.js
            const result = await window.electronAPI.activate({ message, username });
            console.log('Risultato della verifica dell\'hash:', result);

            // Se result è undefined, restituiamo un oggetto con success: false
            if (!result) {
                return { success: false, error: "error" };
            }
            //se result.success è true, l'attivazione è andata a buon fine e faccio sparire la finestra di attivazione
            if (result.success) {
                this.activationMessage.value = ''; // Pulisci il campo della chiave
                this.activationUsername.value = ''; // Pulisci il campo dell'username
                this.activationError.innerText = ''; // Pulisci eventuali errori

                const modal = document.getElementById('activationModal');
                modal.classList.remove('show');
                modal.style.display = 'none'; // Explicitly hide the element

                this.log('Attivazione completata con successo!');
                return { success: true };
            } else {
                this.activationError.innerText = result.error || 'Errore sconosciuto durante l\'attivazione';
                return { success: false, error: result.error || 'Errore sconosciuto' };
            }


        } catch (error) {
            console.error('Errore durante la verifica dell\'hash:', error);
            return { success: false, error: `Errore durante la verifica: ${error.message}` };
        }
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new SDFormatterApp();

    // Make app available globally for debugging
    window.sdFormatterApp = app;
});