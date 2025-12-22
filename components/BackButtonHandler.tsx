import React, { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { useNavigate, useLocation } from 'react-router-dom';

const BackButtonHandler: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const handleBackButton = async () => {
            const exitRoutes = ['/login', '/customer-login', '/company-selector'];
            const isRoot = location.pathname === '/' || location.pathname === '/customer-portal';

            if (exitRoutes.includes(location.pathname)) {
                await CapacitorApp.exitApp();
            } else if (isRoot) {
                // For root pages, maybe double tap to exit or just exit
                await CapacitorApp.exitApp();
            } else {
                navigate(-1);
            }
        };

        // Add Listener
        const backButtonListener = CapacitorApp.addListener('backButton', handleBackButton);

        // Cleanup
        return () => {
            backButtonListener.then(handler => handler.remove());
        };
    }, [navigate, location]);

    return null; // This component handles logic only
};

export default BackButtonHandler;
