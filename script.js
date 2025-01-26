document.getElementById('connect-button').addEventListener('click', async () => {
    const device = await navigator.usb.requestDevice({ filters: [{ vendorId: 0x18d1 }] });
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
});