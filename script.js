// Global connection state with additional properties
const connectionState = {
    device: null,
    transport: null,
    connected: false,
    connecting: false,
    lastChecked: 0
};

let appListData = []; // Store the complete list of apps

function dataViewToString(dataView) {
    return new TextDecoder().decode(dataView.buffer);
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryOperation(operation, maxAttempts = 3, delayMs = 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === maxAttempts) throw error;
            if (error.message.includes('transfer error') || error.message.includes('disconnected')) {
                await sleep(delayMs);
                continue;
            }
            throw error;
        }
    }
}

// connection checking function
async function verifyConnection() {
    // Prevent checking too frequently
    if (Date.now() - connectionState.lastChecked < 1000) {
        return connectionState.connected;
    }

    try {
        if (!connectionState.device) {
            return false;
        }

        const shell = await connectionState.device.shell('echo "test"');
        const response = await shell.receive();
        const result = dataViewToString(response.data);
        
        connectionState.connected = result.includes('test');
        connectionState.lastChecked = Date.now();
        return connectionState.connected;
    } catch (error) {
        connectionState.connected = false;
        return false;
    }
}

// Connection management functions
async function initializeAdbConnection() {
    if (connectionState.connecting) return null;
    connectionState.connecting = true;

    try {
        // Clear existing connection
        if (connectionState.transport) {
            try {
                await connectionState.transport.close();
            } catch (e) {
                console.warn('Error closing existing transport:', e);
            }
        }

        const transport = await Adb.open("WebUSB");
        const device = await transport.connectAdb("host::", (key) => {
            console.log('Please accept the connection on your device...');
        });

        // Verify connection works
        const testShell = await device.shell('echo "test"');
        const testResponse = await testShell.receive();
        
        if (!dataViewToString(testResponse.data).includes('test')) {
            throw new Error('Failed to verify device connection');
        }

        connectionState.transport = transport;
        connectionState.device = device;
        connectionState.connected = true;
        connectionState.lastChecked = Date.now();

        // disconnect event listener
        navigator.usb.addEventListener('disconnect', handleDeviceDisconnect);

        return device;
    } catch (error) {
        connectionState.connected = false;
        connectionState.device = null;
        connectionState.transport = null;
        throw error;
    } finally {
        connectionState.connecting = false;
    }
}

function handleDeviceDisconnect(event) {
    connectionState.connected = false;
    connectionState.device = null;
    connectionState.transport = null;
    
    // Clear the app list
    document.getElementById('app-list').innerHTML = '';
    
    // Disable search on disconnect
    setSearchEnabled(false);
    
    // Update UI to show disconnected state
    document.getElementById('connect-button').disabled = false;
    alert('Device disconnected. Please reconnect your device and try again.');
}

// connect button handler
document.getElementById('connect-button').addEventListener('click', async () => {
    if (connectionState.connected) return;
    
    const button = document.getElementById('connect-button');
    button.disabled = true;
    
    try {
        const device = await initializeAdbConnection();
        button.textContent = 'Connected';
        await refreshAppList(device);
    } catch (error) {
        console.error('Connection error:', error);
        button.disabled = false;
        alert(`Connection failed: ${error.message}`);
    }
});

// uninstall function
async function uninstallPackage(pkg) {
    if (!await verifyConnection()) {
        throw new Error('No active connection');
    }

    try {
        return await retryOperation(async () => {
            if (!await verifyConnection()) {
                throw new Error('Lost connection to device');
            }

            const shell = await connectionState.device.shell(`pm uninstall ${pkg}`);
            await sleep(500);
            const response = await shell.receive();
            return dataViewToString(response.data);
        });
    } catch (error) {
        if (error.message.includes('transfer error') || 
            error.message.includes('disconnected') ||
            error.message.includes('Lost connection')) {
            
            // Try reconnecting once
            try {
                await initializeAdbConnection();
                // Retry uninstall after reconnection
                const shell = await connectionState.device.shell(`pm uninstall ${pkg}`);
                await sleep(500);
                const response = await shell.receive();
                return dataViewToString(response.data);
            } catch (reconnectError) {
                connectionState.connected = false;
                throw new Error('Failed to reconnect to device');
            }
        }
        throw error;
    }
}

async function refreshAppList(device) {
    const appList = document.getElementById('app-list');
    
    // Disable search while loading
    setSearchEnabled(false);
    
    // Show loading state
    const shell = await device.shell("pm list packages");
    const response = await shell.receive();
    const output = dataViewToString(response.data);
    
    if (!output) {
        throw new Error('No output received from device');
    }

    const packages = output.split('\n')
        .map(pkg => pkg.replace('package:', '').trim())
        .filter(pkg => pkg);

    // Clear the stored app list
    appListData = [];
    
    // Store just package names
    packages.forEach(pkg => {
        appListData.push({ 
            name: pkg, // Using package name as name
            package: pkg 
        });
    });

    // Enable search
    setSearchEnabled(true);
    
    // Initial display of all apps
    displayFilteredApps('');
}

function displayFilteredApps(filterText) {
    const appList = document.getElementById('app-list');
    const fragment = document.createDocumentFragment();
    
    const filteredApps = appListData.filter(app => 
        app.package.toLowerCase().includes(filterText.toLowerCase())
    );

    filteredApps.forEach(app => {
        const listItem = document.createElement('li');
        
        const appInfo = document.createElement('div');
        appInfo.className = 'app-info';
        
        const packageSpan = document.createElement('span');
        packageSpan.className = 'app-package';
        packageSpan.textContent = app.package;
        
        appInfo.appendChild(packageSpan);
        listItem.appendChild(appInfo);
        
        const uninstallButton = document.createElement('button');
        uninstallButton.textContent = 'Uninstall';
        uninstallButton.className = 'uninstall-button';
        
        uninstallButton.addEventListener('click', async () => {
            if (!await verifyConnection()) {
                alert('Device disconnected. Please reconnect and try again.');
                document.getElementById('connect-button').disabled = false;
                document.getElementById('connect-button').textContent = 'Connect to Device';
                return;
            }

            const confirmUninstall = confirm(`Are you sure you want to uninstall ${app.package}?`);
            if (confirmUninstall) {
                uninstallButton.disabled = true;
                try {
                    const result = await uninstallPackage(app.package);
                    if (result.includes('Success')) {
                        appListData = appListData.filter(a => a.package !== app.package);
                        displayFilteredApps(document.getElementById('app-filter').value);
                        alert(`Successfully uninstalled ${app.package}`);
                    } else {
                        alert(`Failed to uninstall ${app.package}: ${result}`);
                    }
                } catch (error) {
                    console.error('Uninstall error:', error);
                    if (!await verifyConnection()) {
                        document.getElementById('app-list').innerHTML = '';
                        document.getElementById('connect-button').disabled = false;
                        document.getElementById('connect-button').textContent = 'Connect to Device';
                    }
                    alert(`Error uninstalling ${app.package}: ${error.message}`);
                } finally {
                    uninstallButton.disabled = false;
                }
            }
        });
        
        listItem.appendChild(uninstallButton);
        fragment.appendChild(listItem);
    });

    appList.innerHTML = '';
    appList.appendChild(fragment);
}

function setSearchEnabled(enabled) {
    const filterInput = document.getElementById('app-filter');
    filterInput.disabled = !enabled;
    filterInput.placeholder = enabled ? "Search apps..." : "Loading apps...";
}

// event listener for the filter input
document.addEventListener('DOMContentLoaded', () => {
    const filterInput = document.getElementById('app-filter');
    filterInput.addEventListener('input', (e) => {
        displayFilteredApps(e.target.value);
    });
});