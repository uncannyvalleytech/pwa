// js/main.js - Updated for Google Sheets
import { handleAuthentication, loadExercises } from './googleSheetsService.js';
import { initEventListeners } from './eventHandlers.js';
import { applyTheme, showView, showModal, initUI } from './ui.js';
import { state } from './state.js';

/**
 * @file main.js is the entry point for the application.
 * It initializes event listeners, handles the authentication flow, and registers the service worker.
 * Updated to use Google Sheets instead of Firebase.
 */

// --- GLOBAL ERROR HANDLER (Error Boundary) ---
window.onerror = function(message, source, lineno, colno, error) {
    console.error("A global error was caught:", { message, source, lineno, colno, error });
    // Display a user-friendly modal instead of crashing
    showModal(
        'An Unexpected Error Occurred',
        'Sorry, something went wrong. Please refresh the page. If the problem persists, please contact support.',
        [{ text: 'Refresh', class: 'cta-button', action: () => window.location.reload() }]
    );
    // Return true to prevent the default browser error handling (e.g., logging to console)
    return true;
};

document.addEventListener('DOMContentLoaded', async () => {
    // CRITICAL FIX: Initialize UI elements only after the DOM is fully loaded.
    initUI();

    // Register the service worker for offline functionality
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('service-worker.js')
                .then(registration => {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                })
                .catch(error => {
                    console.log('ServiceWorker registration failed: ', error);
                });
        });
    }

    // Initialize event listeners for the entire application
    initEventListeners();

    // Load static exercise data from JSON file
    await loadExercises();

    // Start the Google Sheets authentication and data loading process
    handleAuthentication(() => {
        // Apply the user's saved theme (or default)
        applyTheme();
        
        // This block is now more defensive, ensuring state is fully initialized before rendering.
        if (state && state.userSelections && state.workoutTimer) {
            let initialView = 'onboarding';
            if (state.userSelections.onboardingCompleted) {
                initialView = state.workoutTimer.isWorkoutInProgress ? 'workout' : 'home';
            }
            showView(initialView, true);
        } else {
            // This is a fallback for a critical error where the state isn't ready.
            console.error("CRITICAL: State was not ready before attempting to render the initial view.");
            showModal(
                'Initialization Error',
                'There was a problem loading your profile. Please refresh the page.',
                [{ text: 'Refresh', class: 'cta-button', action: () => window.location.reload() }]
            );
        }
    });
});
