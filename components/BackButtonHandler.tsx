import React, { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { useNavigate, useLocation } from 'react-router-dom';

const BackButtonHandler: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const handleBackButton = async () => {
            // Logic:
            // 1. If we are on the "Home" page (Dashboard) or "Login" or "Company Selector", exit app.
            // 2. Otherwise, go back one step in history.
            const exitRoutes = ['/', '/login', '/customer-login', '/company-selector'];

            if (exitRoutes.includes(location.pathname)) {
                // Exit App
                await CapacitorApp.exitApp();
            } else {
                // Go Back
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
