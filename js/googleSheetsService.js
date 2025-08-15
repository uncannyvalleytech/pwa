// js/googleSheetsService.js - CORS Workaround Version
import { state } from './state.js';
import { showModal, closeModal } from './ui.js';
import { APPS_SCRIPT_URL } from './env.js';

/**
 * @file This service handles data persistence using Google Apps Script
 * Uses a CORS workaround approach for better compatibility
 */

// --- CONFIGURATION ---
const LOCAL_STORAGE_KEY = 'progressionAppState';
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
const REQUEST_TIMEOUT = 15000; // 15 seconds
const REDIRECT_URI = window.location.origin + window.location.pathname;

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
        accessToken: null, // New access token field
    };
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
        spreadsheetId = data.SpreadsheetId || null; // Ensure spreadsheetId is updated
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
 * Makes request with multiple fallback strategies
 */
async function makeAppsScriptRequest(method, data = null) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    
    try {
        // Strategy 1: Standard fetch
        let response;
        if (method === 'GET') {
            const url = data ? `${APPS_SCRIPT_URL}?${new URLSearchParams(data)}` : APPS_SCRIPT_URL;
            response = await fetch(url, {
                method: 'GET',
                signal: controller.signal,
                mode: 'no-cors' // This prevents CORS preflight
            });
        } else {
            response = await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
                signal: controller.signal,
                mode: 'cors'
            });
        }
        
        clearTimeout(timeoutId);
        
        // For no-cors mode, we can't read the response
        if (response.type === 'opaque') {
            // Assume success for no-cors requests
            return { success: true };
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        isOnline = true;
        return result;
        
    } catch (error) {
        clearTimeout(timeoutId);
        
        // Strategy 2: Try with script injection (JSONP-like)
        if (method === 'GET') {
            try {
                return await makeJsonpRequest(data);
            } catch (jsonpError) {
                console.warn('JSONP fallback failed:', jsonpError);
            }
        }
        
        isOnline = false;
        throw error;
    }
}

/**
 * JSONP-like request using script injection
 */
function makeJsonpRequest(params = {}) {
    return new Promise((resolve, reject) => {
        const callbackName = 'callback_' + Date.now();
        const script = document.createElement('script');
        const url = new URL(APPS_SCRIPT_URL);
        
        // Add parameters
        Object.keys(params).forEach(key => {
            url.searchParams.append(key, params[key]);
        });
        url.searchParams.append('callback', callbackName);
        
        // Set up callback
        window[callbackName] = function(data) {
            document.head.removeChild(script);
            delete window[callbackName];
            resolve(data);
        };
        
        // Set up error handling
        script.onerror = function() {
            document.head.removeChild(script);
            delete window[callbackName];
            reject(new Error('JSONP request failed'));
        };
        
        script.src = url.toString();
        document.head.appendChild(script);
        
        // Timeout
        setTimeout(() => {
            if (window[callbackName]) {
                document.head.removeChild(script);
                delete window[callbackName];
                reject(new Error('JSONP request timeout'));
            }
        }, REQUEST_TIMEOUT);
    });
}

/**
 * Creates a new spreadsheet
 */
async function createUserSpreadsheet() {
    try {
        console.log('Creating new spreadsheet...');
        
        const result = await makeAppsScriptRequest('POST', {
            action: 'createSpreadsheet'
        });
        
        if (result.success && result.spreadsheetId) {
            spreadsheetId = result.spreadsheetId;
            console.log('Spreadsheet created:', spreadsheetId);
            saveToLocalStorage();
            return spreadsheetId;
        } else {
            throw new Error(result.error || 'Failed to create spreadsheet');
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
        return false;
    }
    
    try {
        console.log('Saving to Google Sheets...');
        
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
        
        const result = await makeAppsScriptRequest('POST', {
            action: 'saveData',
            spreadsheetId: spreadsheetId,
            data: dataToSave
        });
        
        if (result.success) {
            state.lastSyncTime = result.timestamp || new Date().toISOString();
            console.log('Data synced successfully');
            return true;
        } else {
            throw new Error(result.error || 'Save failed');
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
        return null;
    }
    
    try {
        console.log('Loading from Google Sheets...');
        
        const result = await makeAppsScriptRequest('GET', {
            action: 'loadData',
            spreadsheetId: spreadsheetId
        });
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        if (result.UserSelections || Object.keys(result).length > 0) {
            console.log('Data loaded from Google Sheets');
            return result;
        }
        
        return null;
        
    } catch (error) {
        console.error('Error loading from Google Sheets:', error);
        return null;
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
 * Connection test
 */
async function testConnection() {
    try {
        await makeAppsScriptRequest('GET');
        return true;
    } catch (error) {
        return false;
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
        }
        
        // Handle new users
        if (!spreadsheetId) {
            const defaultData = createDefaultUserData();
            applyDataToState(defaultData);
            
            if (await testConnection()) {
                const shouldConnect = await askUserToConnectGoogleSheets();
                if (shouldConnect) {
                    try {
                        await createUserSpreadsheet();
                        await syncData();
                    } catch (error) {
                        console.error('Failed to set up Google Sheets:', error);
                        showModal(
                            'Connection Issue', 
                            'Could not connect to Google Sheets. Your data will be saved locally.',
                            [{ text: 'OK', class: 'secondary-button' }]
                        );
                    }
                }
            } else {
                showModal(
                    'Offline Mode', 
                    'Running in offline mode. Data will be saved locally.',
                    [{ text: 'OK', class: 'secondary-button' }]
                );
            }
        } else {
            // Existing user - try to sync
            try {
                const sheetsData = await loadDataFromSheets();
                if (sheetsData && sheetsData.Timestamp) {
                    const localTime = localData?.lastSyncTime;
                    const sheetsTime = sheetsData.Timestamp;
                    
                    if (!localTime || new Date(sheetsTime) > new Date(localTime)) {
                        applyDataToState(sheetsData);
                        saveToLocalStorage();
                    }
                }
            } catch (error) {
                console.log('Could not sync - using local data');
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

export function connectToUserAccount() {
    showModal(
        'Connect Google Account',
        `<p>To export your data to your own Google Sheet, you need to grant the app permission to create and edit files in your Google Drive.</p>
         <p>This will redirect you to a Google authentication page. All your data will remain in your own account.</p>`,
        [
            {
                text: 'Proceed to Google',
                class: 'cta-button',
                action: () => {
                    window.location.href = googleAuthUrl;
                }
            },
            {
                text: 'Cancel',
                class: 'secondary-button',
                action: closeModal
            }
        ]
    );
}

// --- EVENT LISTENERS ---
window.addEventListener('beforeunload', () => syncData());
window.addEventListener('online', () => { isOnline = true; });
window.addEventListener('offline', () => { isOnline = false; });

const url = new URL(APPS_SCRIPT_URL);
const scriptId = url.pathname.split('/')[3];
const googleAuthUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${scriptId}.apps.googleusercontent.com&redirect_uri=${REDIRECT_URI}&response_type=token&scope=https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file`;
