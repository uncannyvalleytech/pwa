/**
 * @file state.js holds the single source of truth for the application's state.
 * All dynamic data, user selections, and settings are stored here.
 * This makes it easy to see what data the application is working with at any time.
 */

export const state = {
    // User and Authentication State
    userId: null,
    isDataLoaded: false,

    // Onboarding and User Preferences
    userSelections: {
        goal: 'hypertrophy', // 'hypertrophy', 'strength', 'fatLoss'
        trainingAge: 'beginner', // 'novice', 'beginner', 'intermediate', 'advanced'
        daysPerWeek: 4, // Default value, will be updated by user
        dietaryStatus: 'maintenance', // 'surplus', 'maintenance', 'deficit'
        style: 'gym',
        onboardingCompleted: false,
    },

    // App-wide Settings
    settings: {
        units: 'lbs',
        theme: 'dark',
        progressionModel: 'double',
        weightIncrement: 5,
        restDuration: 90, // Default rest duration in seconds
        haptics: true, // User setting to enable/disable haptic feedback
    },

    // Workout Plans and Progress
    allPlans: [],
    activePlanId: null,
    editingPlanId: null,
    currentView: {
        week: 1,
        day: 1
    },

    // User-Created Templates
    savedTemplates: [],

    // UI and View State
    currentViewName: 'onboarding',

    // Onboarding Wizard State
    onboarding: {
        currentStep: 1,
        totalSteps: 7,
    },

    // Static Data Loaded from JSON
    exercises: [],

    // Chart.js instances for the performance summary
    progressChart: null,
    volumeChart: null,
    e1rmChart: null,

    // Main Workout Stopwatch State
    workoutTimer: {
        instance: null,
        elapsed: 0,
        isRunning: false,
        startTime: 0,
        isWorkoutInProgress: false,
    },

    // Rest Timer State
    restTimer: {
        instance: null,
        remaining: 0,
        isRunning: false,
    },

    // Temporary state for the workout summary screen
    workoutSummary: {
        suggestions: [],
        newPRs: 0,
        totalVolume: 0,
        totalSets: 0,
        mesocycleStats: {},
        // NEW: Properties for workout comparison
        volumeChange: null,
        setsChange: null,
        durationChange: null,
    },

    // Holds the chronological history of all completed workouts
    workoutHistory: [],

    // Holds all personal records achieved by the user
    personalRecords: [],
    
    // Holds the user's daily readiness check-in
    dailyCheckin: {
        sleep: 8, // hours
        stress: 3, // 1-10 scale
    },

    // Holds the history of daily check-ins
    dailyCheckinHistory: [],

    // Temporary state for the feedback modal
    feedbackState: {
        currentExercise: null,
        currentExerciseIndex: null,
        soreness: {},
        pump: {},
        jointPain: {},
    },
};
