# MIB SD Card Formatter

A cross-platform desktop application for formatting SD cards and installing the M.I.B package. Built with Electron.

## Features

- Automatic detection of removable drives/SD cards
- SD card formatting with FAT32 file system
- Automatic installation of M.I.B package to SD cards
- Cross-platform support (Windows, macOS, Linux)
- User-friendly interface with real-time progress updates

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (version 14 or higher)
- npm (comes with Node.js)

### Install from source

```bash
# Clone the repository
git clone https://github.com/Orbital01/MIB_TT_app.git

# Navigate to the project directory
cd MIB_TT_app

# Install dependencies
npm install

# Start the application
npm start
```

## Development

```bash
# Run in development mode with live reload
npm run dev

# Build the application for your current platform
npm run build
```

## Project Structure

```
MIB_TT_app/
├── assets/
│   ├── icon.png
│   └── packages/
│       └── M.I.B.zip      # Predefined package to install
├── renderer/
│   ├── index.html         # Main application interface
│   └── preload.js         # Preload script for renderer process
├── main.js                # Main process file
├── package.json           # Dependencies and scripts
└── README.md              # This file
```

## Platform-specific Notes

### Windows
- Administrative privileges are required for formatting drives
- Formats drives using the Windows format command

### macOS
- Sudo password may be required for formatting
- Uses diskutil for drive operations

### Linux
- Uses mkfs.vfat for formatting
- Administrative privileges required for drive operations

## Technologies

- [Electron](https://www.electronjs.org/) - Cross-platform desktop app framework
- [Node.js](https://nodejs.org/) - JavaScript runtime
- [node-disk-info](https://www.npmjs.com/package/node-disk-info) - Disk information library
- [yauzl](https://www.npmjs.com/package/yauzl) - Zip file extraction

## License

This project is licensed under the MIT License.
