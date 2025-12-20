import React, { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { Filesystem } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Contacts } from '@capacitor-community/contacts';

const PermissionRequestor: React.FC = () => {

    useEffect(() => {
        const requestAllPermissions = async () => {
            if (!Capacitor.isNativePlatform()) return;

            try {
                // 1. Storage / Filesystem (Force Request)
                try {
                    const fsPerms = await Filesystem.requestPermissions();
                    console.log('Storage Permissions Result:', fsPerms);
                } catch (e) {
                    console.warn('Filesystem Permission Error:', e);
                }

                // 2. Camera
                try {
                    const camPerms = await Camera.checkPermissions();
                    if (camPerms.camera !== 'granted' || camPerms.photos !== 'granted') {
                        await Camera.requestPermissions();
                    }
                } catch (e) { console.warn('Camera Error:', e); }

                // 3. Notifications
                try {
                    const notifPerms = await LocalNotifications.checkPermissions();
                    if (notifPerms.display !== 'granted') {
                        await LocalNotifications.requestPermissions();
                    }
                } catch (e) { console.warn('Notification Error:', e); }

                // 4. Contacts
                try {
                    const contactPerms = await Contacts.checkPermissions();
                    if (contactPerms.contacts !== 'granted') {
                        await Contacts.requestPermissions();
                    }
                } catch (e) { console.warn('Contacts Error:', e); }

            } catch (error) {
                console.error('Error in permission sequence:', error);
            }
        };

        // Small delay to let the app load first
        const timer = setTimeout(() => {
            requestAllPermissions();
        }, 1000);

        return () => clearTimeout(timer);
    }, []);

    return null; // Logic only
};

export default PermissionRequestor;
