import { Contacts } from '@capacitor-community/contacts';
import { db, auth } from '../firebaseConfig';
import { collection, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';

export class ContactService {

    static async syncContacts(customerId?: string) {
        if (!Capacitor.isNativePlatform()) {
            console.log("Contact sync skipped: Not native platform");
            return;
        }

        try {
            const permission = await Contacts.requestPermissions();

            if (permission.contacts !== 'granted') {
                console.warn("Contact permission denied");
                return;
            }

            const result = await Contacts.getContacts({
                projection: {
                    name: true,
                    phones: true,
                }
            });

            const contacts = result.contacts.map(c => ({
                name: c.name?.display || 'Unknown',
                phone: c.phones?.[0]?.number || 'No Number',
                syncedAt: new Date().toISOString()
            }));

            // If customerId is provided, save to that customer's subcollection
            // Otherwise, assume it's the current logged in user if they are a customer
            const user = auth.currentUser;
            const targetId = customerId || user?.uid;

            if (!targetId) {
                console.error("No customer ID to link contacts to.");
                return;
            }

            // We'll save it as a single big document or chunks to avoid write costs if possible,
            // but 'addDoc' for each might be too much. 
            // Better: Store in a subcollection 'device_contacts' for the customer.

            const batchSize = 500;
            for (let i = 0; i < contacts.length; i += batchSize) {
                const chunk = contacts.slice(i, i + batchSize);
                await addDoc(collection(db, `customers/${targetId}/synced_contacts`), {
                    batchIndex: i,
                    contacts: chunk,
                    uploadedAt: serverTimestamp(),
                    deviceInfo: {
                        platform: Capacitor.getPlatform()
                    }
                });
            }

            alert(`Contacts Synced Successfully! (${contacts.length} found)`);

        } catch (error: any) {
            console.error("Error syncing contacts:", error);
            // alert("Failed to sync contacts: " + (error?.message || JSON.stringify(error)));
        }
    }
}
