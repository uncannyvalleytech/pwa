// js/googleSheetsService.js - Updated for Google Apps Script
import { state } from './state.js';
import { showModal, closeModal } from './ui.js';
import { APPS_SCRIPT_URL } from './env.js';

/**
 * @file This client-side service now communicates with a Google Apps Script web app
 * instead of calling the Google Sheets API directly. This protects your API key.
 */

// --- GOOGLE API CONFIGURATION ---
const API_KEY = 'AIzaSyBrxz4994twpU6QUpgl888Wb-KyevDbyIc';
const CLIENT_ID = '250304194666-32bujjj2bflhoilb1r6uld3239cm4i46.apps.googleusercontent.com';
const CLIENT_SECRET = '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';

// --- LOCAL STORAGE KEY ---
const LOCAL_STORAGE_KEY = 'progressionAppState';
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds

// --- GLOBAL VARIABLES ---
let syncIntervalId = null;
let spreadsheetId = null;

/**
 * Creates the complete, default state object for a new user.
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
        currentView: { week: 1, day: 1 },
        isWorkoutInProgress: false,
        lastSyncTime: null,
        spreadsheetId: null,
    };
}

/**
 * Applies loaded data to the global state.
 */
function applyDataToState(data) {
    if (!data) return;
    
    state.userSelections = { ...state.userSelections, ...data.UserSelections };
    state.settings = { ...state.settings, ...data.Settings };
    state.allPlans = data.AllPlans || [];
    state.savedTemplates = data.SavedTemplates || [];
    state.activePlanId = data.ActivePlanId || (state.allPlans.length > 0 ? state.allPlans[0].id : null);
    state.currentView = data.CurrentView || state.currentView;
    state.workoutHistory = data.WorkoutHistory || [];
    state.personalRecords = data.PersonalRecords || [];
    state.workoutTimer.isWorkoutInProgress = data.IsWorkoutInProgress === 'true' || false;
    state.lastSyncTime = data.Timestamp || null;
    spreadsheetId = data.spreadsheetId || null;
}

/**
 * Creates a new spreadsheet by calling the Apps Script proxy.
 */
async function createUserSpreadsheet() {
  try {
    const response = await fetch(`${APPS_SCRIPT_URL}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'createSpreadsheet' }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    if (data.spreadsheetId) {
      spreadsheetId = data.spreadsheetId;
      saveToLocalStorage();
      return spreadsheetId;
    } else {
      throw new Error(data.error || 'Spreadsheet creation failed.');
    }
  } catch (error) {
    console.error('Error creating spreadsheet:', error);
    throw error;
  }
}

/**
 * Saves data to the spreadsheet by calling the Apps Script proxy.
 */
async function saveDataToSheets() {
  if (!spreadsheetId) {
    console.error('No spreadsheet ID available');
    return false;
  }

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
    };

    const response = await fetch(`${APPS_SCRIPT_URL}`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'saveData',
        spreadsheetId: spreadsheetId,
        data: dataToSave,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to save data to sheets.');
    }
    
    state.lastSyncTime = new Date().toISOString();
    console.log('Data successfully synced to Google Sheets');
    return true;
  } catch (error) {
    console.error('Error saving to Google Sheets:', error);
    showModal('Sync Error', 'Could not save your data to Google Sheets. Your data is saved locally and will sync when the connection is restored.');
    return false;
  }
}

/**
 * Loads data from the spreadsheet by calling the Apps Script proxy.
 */
async function loadDataFromSheets() {
  if (!spreadsheetId) {
    console.log('No spreadsheet ID available');
    return null;
  }

  try {
    const response = await fetch(`${APPS_SCRIPT_URL}?spreadsheetId=${spreadsheetId}`, {
      method: 'GET',
    });
    
    const data = await response.json();
    if (data.error) {
        throw new Error(data.error);
    }

    // The Apps Script returns a single object from the last row.
    if (data.UserSelections) {
      return {
          userSelections: data.UserSelections,
          settings: data.Settings,
          allPlans: data.AllPlans,
          activePlanId: data.ActivePlanId,
          workoutHistory: data.WorkoutHistory,
          personalRecords: data.PersonalRecords,
          savedTemplates: data.SavedTemplates,
          currentView: data.CurrentView,
          isWorkoutInProgress: data.IsWorkoutInProgress,
          lastSyncTime: data.Timestamp,
          spreadsheetId: spreadsheetId
      };
    } else {
        return null;
    }

  } catch (error) {
    console.error('Error loading from Google Sheets:', error);
    return null;
  }
}

/**
 * Save data to local storage
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
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
}

/**
 * Load data from local storage
 */
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
 * Start periodic sync
 */
function startPeriodicSync() {
    if (syncIntervalId) {
        clearInterval(syncIntervalId);
    }

    syncIntervalId = setInterval(async () => {
        console.log('Performing periodic sync...');
        await syncData();
    }, SYNC_INTERVAL);
}

/**
 * Stop periodic sync
 */
function stopPeriodicSync() {
    if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
    }
}

/**
 * Main sync function
 */
async function syncData() {
    // Always save to local storage first
    saveToLocalStorage();
    
    // Try to sync with Google Sheets
    return await saveDataToSheets();
}

/**
 * Initialize the data service
 */
async function initializeDataService() {
    try {
        // Load from local storage first
        const localData = loadFromLocalStorage();
        if (localData) {
            spreadsheetId = localData.spreadsheetId;
            applyDataToState(localData);
        }
        
        // If no spreadsheet ID, this is a new user
        if (!spreadsheetId) {
            const defaultData = createDefaultUserData();
            applyDataToState(defaultData);
            
            const shouldConnect = await askUserToConnectGoogleSheets();
            if (shouldConnect) {
                // The Apps Script handles both creation and writing
                await createUserSpreadsheet();
                await syncData();
            }
        } else {
            // Try to load latest data from Google Sheets
            try {
                const sheetsData = await loadDataFromSheets();
                if (sheetsData) {
                    const localTime = localData?.lastSyncTime;
                    const sheetsTime = sheetsData.Timestamp;
                    
                    if (!localTime || (sheetsTime && new Date(sheetsTime) > new Date(localTime))) {
                        applyDataToState(sheetsData);
                        saveToLocalStorage();
                    }
                }
            } catch (error) {
                console.log('Could not load from Google Sheets, using local data');
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
        showModal('Offline Mode', 'Running in offline mode. Data will be saved locally.');
        return false;
    }
}

/**
 * Ask user if they want to connect to Google Sheets
 */
function askUserToConnectGoogleSheets() {
    return new Promise((resolve) => {
        showModal(
            'Connect to Google Sheets',
            'Would you like to sync your workout data with your own Google Sheets? This keeps your data in your control and enables sync across devices.',
            [
                { 
                    text: 'Skip for Now', 
                    class: 'secondary-button',
                    action: () => {
                        closeModal();
                        showModal('Offline Mode', 'Running in offline mode. Data will be saved locally in your browser.');
                        resolve(false);
                    }
                },
                { 
                    text: 'Connect to Google Sheets', 
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
 * Handle page unload (save data before closing)
 */
function handlePageUnload() {
    syncData();
    stopPeriodicSync();
}

/**
 * Public API functions
 */
export async function saveFullState() {
    return await syncData();
}

export async function updateState(key, value) {
    state[key] = value;
    saveToLocalStorage();
    return true; // The periodic sync will handle the push to sheets
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
        if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
        state.exercises = await response.json();
    } catch (error) {
        console.error("Failed to load exercises.json:", error);
        showModal(
            'Error Loading Data',
            'Could not load the necessary exercise data. The app may not function correctly. Please check your connection and refresh the page.',
            [{ text: 'OK', class: 'cta-button' }]
        );
    }
}

// Set up page unload handler
window.addEventListener('beforeunload', handlePageUnload);
window.addEventListener('unload', handlePageUnload);

// For mobile apps, also handle visibility change
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        syncData();
    }
});
