// js/googleSheetsService.js - Fixed CORS Version
import { state } from './state.js';
import { showModal, closeModal } from './ui.js';
import { APPS_SCRIPT_URL } from './env.js';

/**
 * @file This service handles data persistence using Google Apps Script
 * Fixed version with proper CORS handling
 */

// --- CONFIGURATION ---
const LOCAL_STORAGE_KEY = 'progressionAppState';
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
const REQUEST_TIMEOUT = 15000; // 15 seconds

// --- GLOBAL VARIABLES ---
let syncIntervalId = null;
let spreadsheetId = null;
let isOnline = navigator.onLine;

/**
 * Creates default user data
 */
function createDefaultUserData() {
    return {
        userSelections: {
            goal: 'hypertrophy',
            trainingAge: 'beginner',
            daysPerWeek: 4,
            dietaryStatus: 'maintenance',
            style: 'gym',
            onboardingCompleted: false,
        },
        settings: {
            units: 'lbs',
            theme: 'dark',
            progressionModel: 'double',
            weightIncrement: 5,
            restDuration: 90,
            haptics: true,
        },
        allPlans: [],
        activePlanId: null,
        workoutHistory: [],
        personalRecords: [],
        savedTemplates: [],
        dailyCheckinHistory: [],
        currentView: { week: 1, day: 1 },
        isWorkoutInProgress: false,
        lastSyncTime: null,
        spreadsheetId: null,
    };
}

/**
 * Makes request to Apps Script with proper CORS handling
 */
async function makeAppsScriptRequest(action, data = null) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    
    try {
        let url, options;
        
        if (action === 'loadData' || action === 'testConnection') {
            // GET requests - use query parameters
            const params = new URLSearchParams({
                action: action,
                ...(data || {})
            });
            url = `${APPS_SCRIPT_URL}?${params.toString()}`;
            options = {
                method: 'GET',
                signal: controller.signal,
            };
        } else {
            // POST requests - send data in body as form data to avoid preflight
            const formData = new FormData();
            formData.append('action', action);
            if (data) {
                Object.keys(data).forEach(key => {
                    formData.append(key, typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key]);
                });
            }
            
            url = APPS_SCRIPT_URL;
            options = {
                method: 'POST',
                signal: controller.signal,
                body: formData,
            };
        }
        
        console.log(`Making ${options.method} request to Apps Script:`, action);
        
        const response = await fetch(url, options);
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        isOnline = true;
        
        console.log('Apps Script response:', result);
        return result;
        
    } catch (error) {
        clearTimeout(timeoutId);
        console.error('Apps Script request failed:', error);
        
        // For connection errors, try a simple JSONP fallback for GET requests
        if (action === 'loadData' && !error.name === 'AbortError') {
            try {
                console.log('Trying JSONP fallback...');
                return await makeJsonpRequest({ action, ...data });
            } catch (jsonpError) {
                console.warn('JSONP fallback also failed:', jsonpError);
            }
        }
        
        isOnline = false;
        throw error;
    }
}

/**
 * JSONP-like request using script injection (fallback for GET requests)
 */
function makeJsonpRequest(params = {}) {
    return new Promise((resolve, reject) => {
        const callbackName = 'callback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const script = document.createElement('script');
        const url = new URL(APPS_SCRIPT_URL);
        
        // Add parameters
        Object.keys(params).forEach(key => {
            url.searchParams.append(key, typeof params[key] === 'object' ? JSON.stringify(params[key]) : params[key]);
        });
        url.searchParams.append('callback', callbackName);
        
        // Set up callback
        window[callbackName] = function(data) {
            cleanup();
            resolve(data);
        };
        
        // Set up error handling
        script.onerror = function() {
            cleanup();
            reject(new Error('JSONP request failed'));
        };
        
        function cleanup() {
            if (script.parentNode) {
                document.head.removeChild(script);
            }
            delete window[callbackName];
        }
        
        script.src = url.toString();
        document.head.appendChild(script);
        
        // Timeout
        setTimeout(() => {
            if (window[callbackName]) {
                cleanup();
                reject(new Error('JSONP request timeout'));
            }
        }, REQUEST_TIMEOUT);
    });
}

/**
 * Test connection to Apps Script
 */
async function testConnection() {
    try {
        console.log('Testing connection to Apps Script...');
        const result = await makeAppsScriptRequest('testConnection');
        console.log('Connection test result:', result);
        return result && result.success !== false;
    } catch (error) {
        console.error('Connection test failed:', error);
        return false;
    }
}

/**
 * Creates a new spreadsheet
 */
async function createUserSpreadsheet() {
    try {
        console.log('Creating new spreadsheet...');
        
        const result = await makeAppsScriptRequest('createSpreadsheet');
        
        if (result && result.success && result.spreadsheetId) {
            spreadsheetId = result.spreadsheetId;
            console.log('Spreadsheet created successfully:', spreadsheetId);
            saveToLocalStorage();
            return spreadsheetId;
        } else {
            throw new Error(result?.error || 'Failed to create spreadsheet - no spreadsheet ID returned');
        }
        
    } catch (error) {
        console.error('Error creating spreadsheet:', error);
        throw error;
    }
}

/**
 * Saves data to Google Sheets
 */
async function saveDataToSheets() {
    if (!spreadsheetId || !isOnline) {
        console.log('Cannot save to sheets - missing spreadsheetId or offline');
        return false;
    }
    
    try {
        console.log('Saving data to Google Sheets...');
        
        const dataToSave = {
            userSelections: state.userSelections,
            settings: state.settings,
            allPlans: state.allPlans,
            activePlanId: state.activePlanId,
            workoutHistory: state.workoutHistory,
            personalRecords: state.personalRecords,
            savedTemplates: state.savedTemplates,
            currentView: state.currentView,
            isWorkoutInProgress: state.workoutTimer.isWorkoutInProgress,
        };
        
        const result = await makeAppsScriptRequest('saveData', {
            spreadsheetId: spreadsheetId,
            data: dataToSave
        });
        
        if (result && result.success) {
            state.lastSyncTime = result.timestamp || new Date().toISOString();
            console.log('Data synced successfully to Google Sheets');
            return true;
        } else {
            throw new Error(result?.error || 'Save operation failed');
        }
        
    } catch (error) {
        console.error('Error saving to Google Sheets:', error);
        return false;
    }
}

/**
 * Loads data from Google Sheets
 */
async function loadDataFromSheets() {
    if (!spreadsheetId || !isOnline) {
        console.log('Cannot load from sheets - missing spreadsheetId or offline');
        return null;
    }
    
    try {
        console.log('Loading data from Google Sheets...');
        
        const result = await makeAppsScriptRequest('loadData', {
            spreadsheetId: spreadsheetId
        });
        
        if (result && result.error) {
            throw new Error(result.error);
        }
        
        if (result && (result.UserSelections || Object.keys(result).length > 0)) {
            console.log('Data loaded successfully from Google Sheets');
            return result;
        }
        
        console.log('No data found in Google Sheets');
        return null;
        
    } catch (error) {
        console.error('Error loading from Google Sheets:', error);
        return null;
    }
}

/**
 * Applies data to application state
 */
function applyDataToState(data) {
    if (!data) return;
    
    // Handle Apps Script response format
    if (data.UserSelections) {
        state.userSelections = { ...state.userSelections, ...data.UserSelections };
        state.settings = { ...state.settings, ...data.Settings };
        state.allPlans = data.AllPlans || [];
        state.savedTemplates = data.SavedTemplates || [];
        state.activePlanId = data.ActivePlanId || (state.allPlans.length > 0 ? state.allPlans[0].id : null);
        state.currentView = data.CurrentView || state.currentView;
        state.workoutHistory = data.WorkoutHistory || [];
        state.personalRecords = data.PersonalRecords || [];
        state.workoutTimer.isWorkoutInProgress = data.IsWorkoutInProgress === true || data.IsWorkoutInProgress === 'true';
        state.lastSyncTime = data.Timestamp || null;
        spreadsheetId = data.SpreadsheetId || null;
    } else {
        // Handle local storage format
        state.userSelections = { ...state.userSelections, ...data.userSelections };
        state.settings = { ...state.settings, ...data.settings };
        state.allPlans = data.allPlans || [];
        state.savedTemplates = data.savedTemplates || [];
        state.activePlanId = data.activePlanId || (state.allPlans.length > 0 ? state.allPlans[0].id : null);
        state.currentView = data.currentView || state.currentView;
        state.workoutHistory = data.workoutHistory || [];
        state.personalRecords = data.personalRecords || [];
        state.workoutTimer.isWorkoutInProgress = data.isWorkoutInProgress || false;
        state.lastSyncTime = data.lastSyncTime || null;
        spreadsheetId = data.spreadsheetId || null;
    }
}

/**
 * Local storage functions
 */
function saveToLocalStorage() {
    try {
        const dataToSave = {
            userSelections: state.userSelections,
            settings: state.settings,
            allPlans: state.allPlans,
            activePlanId: state.activePlanId,
            workoutHistory: state.workoutHistory,
            personalRecords: state.personalRecords,
            savedTemplates: state.savedTemplates,
            currentView: state.currentView,
            isWorkoutInProgress: state.workoutTimer.isWorkoutInProgress,
            lastSyncTime: state.lastSyncTime,
            spreadsheetId: spreadsheetId
        };
        
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToSave));
        console.log('Data saved to local storage');
        
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
}

function loadFromLocalStorage() {
    try {
        const localDataString = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (localDataString) {
            return JSON.parse(localDataString);
        }
    } catch (error) {
        console.error('Error loading from localStorage:', error);
    }
    return null;
}

/**
 * Sync functions
 */
async function syncData() {
    saveToLocalStorage();
    
    if (spreadsheetId && isOnline) {
        return await saveDataToSheets();
    }
    
    return true;
}

function startPeriodicSync() {
    if (syncIntervalId) {
        clearInterval(syncIntervalId);
    }
    
    syncIntervalId = setInterval(async () => {
        if (isOnline && spreadsheetId) {
            console.log('Performing periodic sync...');
            await syncData();
        }
    }, SYNC_INTERVAL);
}

function stopPeriodicSync() {
    if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
    }
}

/**
 * User prompts
 */
function askUserToConnectGoogleSheets() {
    return new Promise((resolve) => {
        showModal(
            'Connect to Google Sheets',
            'Would you like to sync your workout data with Google Sheets? This keeps your data safe and accessible from any device.',
            [
                { 
                    text: 'Skip for Now', 
                    class: 'secondary-button',
                    action: () => {
                        closeModal();
                        resolve(false);
                    }
                },
                { 
                    text: 'Connect', 
                    class: 'cta-button',
                    action: () => {
                        closeModal();
                        resolve(true);
                    }
                }
            ]
        );
    });
}

/**
 * Initialize data service
 */
async function initializeDataService() {
    try {
        console.log('Initializing data service...');
        
        // Load local data first
        const localData = loadFromLocalStorage();
        if (localData) {
            spreadsheetId = localData.spreadsheetId;
            applyDataToState(localData);
            console.log('Local data loaded, spreadsheetId:', spreadsheetId);
        }
        
        // Test connection first
        const connectionWorks = await testConnection();
        console.log('Connection test result:', connectionWorks);
        
        if (!connectionWorks) {
            console.log('Cannot connect to Google Apps Script - running in offline mode');
            if (!localData) {
                applyDataToState(createDefaultUserData());
            }
            showModal(
                'Offline Mode', 
                'Could not connect to Google Sheets. Running in offline mode - your data will be saved locally.',
                [{ text: 'OK', class: 'secondary-button' }]
            );
            state.isDataLoaded = true;
            return false;
        }
        
        // Handle new users
        if (!spreadsheetId) {
            const defaultData = createDefaultUserData();
            applyDataToState(defaultData);
            
            const shouldConnect = await askUserToConnectGoogleSheets();
            if (shouldConnect) {
                try {
                    await createUserSpreadsheet();
                    await syncData();
                    console.log('Successfully set up Google Sheets integration');
                } catch (error) {
                    console.error('Failed to set up Google Sheets:', error);
                    showModal(
                        'Connection Issue', 
                        `Could not connect to Google Sheets: ${error.message}. Your data will be saved locally.`,
                        [{ text: 'OK', class: 'secondary-button' }]
                    );
                }
            }
        } else {
            // Existing user - try to sync
            try {
                const sheetsData = await loadDataFromSheets();
                if (sheetsData && sheetsData.Timestamp) {
                    const localTime = localData?.lastSyncTime;
                    const sheetsTime = sheetsData.Timestamp;
                    
                    if (!localTime || new Date(sheetsTime) > new Date(localTime)) {
                        console.log('Using newer data from Google Sheets');
                        applyDataToState(sheetsData);
                        saveToLocalStorage();
                    } else {
                        console.log('Local data is newer, keeping local data');
                    }
                }
            } catch (error) {
                console.log('Could not sync with Google Sheets - using local data:', error.message);
            }
        }
        
        state.isDataLoaded = true;
        startPeriodicSync();
        
        return true;
        
    } catch (error) {
        console.error('Error initializing data service:', error);
        
        const localData = loadFromLocalStorage();
        if (localData) {
            applyDataToState(localData);
        } else {
            applyDataToState(createDefaultUserData());
        }
        
        state.isDataLoaded = true;
        return false;
    }
}

// --- PUBLIC API ---
export async function saveFullState() {
    return await syncData();
}

export async function updateState(key, value) {
    state[key] = value;
    saveToLocalStorage();
    return true;
}

export function handleAuthentication(onAuthenticated) {
    initializeDataService().then(() => {
        if (onAuthenticated && state.isDataLoaded) {
            onAuthenticated();
        }
    });
}

export async function forceInitializeGoogleSheets() {
    console.log('Force initializing Google Sheets connection...');
    
    const connectionWorks = await testConnection();
    if (!connectionWorks) {
        throw new Error('Cannot connect to Google Apps Script. Please check your internet connection and try again.');
    }
    
    if (!spreadsheetId) {
        console.log('No existing spreadsheet - creating new one...');
        await createUserSpreadsheet();
        await syncData();
        console.log('Google Sheets integration set up successfully');
    } else {
        console.log('Using existing spreadsheet:', spreadsheetId);
        // Try to sync existing data
        try {
            await syncData();
            console.log('Synced with existing Google Sheets');
        } catch (error) {
            console.warn('Could not sync with existing sheets, but connection works:', error.message);
        }
    }
    
    return true;
}

export async function loadExercises() {
    try {
        const response = await fetch('exercises.json');
        if (!response.ok) throw new Error(`Failed to load exercises: ${response.statusText}`);
        state.exercises = await response.json();
    } catch (error) {
        console.error('Failed to load exercises:', error);
        showModal(
            'Error Loading Exercises',
            'Could not load exercise data. Please refresh the page.',
            [{ text: 'Refresh', class: 'cta-button', action: () => window.location.reload() }]
        );
    }
}

// --- EVENT LISTENERS ---
window.addEventListener('beforeunload', () => syncData());
window.addEventListener('online', () => { 
    isOnline = true; 
    console.log('Back online - will attempt to sync on next operation');
});
window.addEventListener('offline', () => { 
    isOnline = false; 
    console.log('Gone offline - using local storage only');
});
