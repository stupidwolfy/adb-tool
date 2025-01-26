document.getElementById('connect-button').addEventListener('click', async () => {
    try {
        console.log('Requesting USB device...');
        const filters = [
            { vendorId: 0x18d1 }, // Google Inc.
            { vendorId: 0x04e8 }, // Samsung Electronics Co., Ltd
            { vendorId: 0x12d1 }, // Huawei Technologies Co., Ltd.
            { vendorId: 0x2a70 }, // OnePlus Technology (Shenzhen) Co., Ltd.
            { vendorId: 0x22b8 }, // Motorola PCS
            { vendorId: 0x0fce }, // Sony Ericsson Mobile Communications AB
            { vendorId: 0x05c6 }, // Qualcomm, Inc.
            { vendorId: 0x2c7c }, // Quectel Wireless Solutions Co., Ltd.
            { vendorId: 0x2717 }, // Xiaomi Inc.
            { vendorId: 0x0bb4 }  // HTC (High Tech Computer Corp.)
        ];
        const device = await navigator.usb.requestDevice({ filters });
        console.log('Device selected:', device);

        const adb = new Adb(device);
        await adb.connect();
        alert('Connected to device!');

        // Retrieve the list of installed packages
        const output = await adb.shell('pm list packages');
        const packages = output.split('\n').map(pkg => pkg.replace('package:', '').trim());

        // Display the list of installed packages
        const appList = document.getElementById('app-list');
        appList.innerHTML = '';
        packages.forEach(pkg => {
            const listItem = document.createElement('li');
            listItem.textContent = pkg;
            const uninstallButton = document.createElement('button');
            uninstallButton.textContent = 'Uninstall';
            uninstallButton.className = 'uninstall-button';
            uninstallButton.addEventListener('click', async () => {
                const confirmUninstall = confirm(`Are you sure you want to uninstall ${pkg}?`);
                if (confirmUninstall) {
                    await adb.shell(`pm uninstall ${pkg}`);
                    alert(`Uninstalled ${pkg}`);
                    listItem.remove();
                }
            });
            listItem.appendChild(uninstallButton);
            appList.appendChild(listItem);
        });
    } catch (error) {
        console.error('Failed to connect to device:', error);
        alert('Failed to connect to device. Please ensure it is properly connected and try again.');
    }
});