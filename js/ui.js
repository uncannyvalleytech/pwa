import { state } from './state.js';
import { createSetRowHTML, findLastPerformance } from './utils.js';

/**
 * @file ui.js handles all user interface updates and DOM manipulation.
 * This file contains functions for rendering different views, updating displays, and managing UI state.
 */

// DOM element references are now initialized in initUI() to prevent race conditions.
export let elements = {};

let currentTooltip = null;
let confettiAnimationId;
let toastTimeout;


/**
 * Initializes the elements object by querying the DOM.
 * This MUST be called after the DOM is fully loaded.
 */
export function initUI() {
    elements = {
        onboardingContainer: document.getElementById('onboarding-container'),
        homeScreen: document.getElementById('home-screen'),
        templatePortalView: document.getElementById('template-portal-view'),
        workoutView: document.getElementById('daily-workout-view'),
        performanceSummaryView: document.getElementById('performance-summary-view'),
        settingsView: document.getElementById('settings-view'),
        workoutSummaryView: document.getElementById('workout-summary-view'),
        modal: document.getElementById('modal'),
        feedbackModal: document.getElementById('feedback-modal'),
        dailyCheckinModal: document.getElementById('daily-checkin-modal'),
        exerciseListContainer: document.getElementById('exercise-list-container'),
        exerciseListLoader: document.getElementById('exercise-list-loader'),
        workoutStopwatchDisplay: document.getElementById('workout-stopwatch-display'),
        restTimerDisplay: document.getElementById('rest-timer-display'),
        exerciseTrackerSelect: document.getElementById('exercise-tracker-select'),
        weightChartContainer: document.getElementById('weight-chart-container'),
        e1rmChartContainer: document.getElementById('e1rm-chart-container'),
        sleepSlider: document.getElementById('sleep-slider'),
        stressSlider: document.getElementById('stress-slider'),
        sleepLabel: document.getElementById('sleep-label'),
        stressLabel: document.getElementById('stress-label'),
        homeWorkoutTitle: document.getElementById('home-workout-title'),
        homeWorkoutIcon: document.getElementById('home-workout-icon'),
        confettiCanvas: document.getElementById('confetti-canvas'),
        toast: document.getElementById('toast'),
        toastMessage: document.getElementById('toast-message'),
        toastIcon: document.getElementById('toast-icon'),
        weightProgressChart: document.getElementById('weight-progress-chart'),
        e1rmProgressChart: document.getElementById('e1rm-progress-chart'),
        volumeChart: document.getElementById('volume-chart'),
    };
}


/**
 * Applies the current theme to the document body
 */
export function applyTheme() {
    document.body.setAttribute('data-theme', state.settings.theme);
}

/**
 * Shows a specific view and hides all others
 * @param {string} viewName - The name of the view to show
 * @param {boolean} skipAnimation - Whether to skip the fade animation
 */
export function showView(viewName, skipAnimation = false) {
    const views = {
        onboarding: elements.onboardingContainer,
        home: elements.homeScreen,
        templatePortal: elements.templatePortalView,
        workout: elements.workoutView,
        performanceSummary: elements.performanceSummaryView,
        settings: elements.settingsView,
        workoutSummary: elements.workoutSummaryView,
    };

    // Stop confetti if navigating away from the summary view
    if (state.currentViewName === 'workoutSummary' && viewName !== 'workoutSummary') {
        stopConfetti();
    }

    // Hide all views
    Object.values(views).forEach(view => {
        if (view) {
            view.classList.add('hidden');
            view.classList.remove('view');
        }
    });

    // Show the requested view
    const targetView = views[viewName];
    if (targetView) {
        targetView.classList.remove('hidden');
        targetView.classList.add('view');
        state.currentViewName = viewName;

        // Render specific view content
        switch (viewName) {
            case 'onboarding':
                renderOnboardingStep();
                break;
            case 'home':
                renderHomeView();
                break;
            case 'templatePortal':
                renderTemplatePortal();
                break;
            case 'workout':
                renderDailyWorkout();
                break;
            case 'performanceSummary':
                renderPerformanceSummary();
                break;
            case 'settings':
                renderSettings();
                break;
            case 'workoutSummary':
                renderWorkoutSummary();
                break;
        }
    }
}

/**
 * Renders the home view, updating the button based on workout status.
 */
export function renderHomeView() {
    if (!elements.homeWorkoutTitle || !elements.homeWorkoutIcon) return;
    if (state.workoutTimer.isWorkoutInProgress) {
        elements.homeWorkoutTitle.textContent = "Continue Workout";
        elements.homeWorkoutIcon.textContent = "▶️";
    } else {
        elements.homeWorkoutTitle.textContent = "Start Next Workout";
        elements.homeWorkoutIcon.textContent = "▶️";
    }
}


/**
 * Renders the current onboarding step
 */
export function renderOnboardingStep() {
    const currentStep = state.onboarding.currentStep;
    const totalSteps = state.onboarding.totalSteps;
    
    // Update progress bar
    const progressBar = document.getElementById('onboarding-progress');
    if (progressBar) {
        const progressPercent = (currentStep / totalSteps) * 100;
        progressBar.style.width = `${progressPercent}%`;
    }

    // Show current step
    const steps = document.querySelectorAll('.step');
    steps.forEach((step, index) => {
        step.classList.remove('active', 'fade-out');
        if (index + 1 === currentStep) {
            step.classList.add('active');
        }
    });

    // Update selected values in cards
    updateOnboardingSelections();
}

/**
 * Updates the UI to reflect current user selections in onboarding
 */
function updateOnboardingSelections() {
    Object.keys(state.userSelections).forEach(field => {
        const value = state.userSelections[field];
        const cards = document.querySelectorAll(`[data-field="${field}"] .goal-card`);
        cards.forEach(card => {
            card.classList.remove('active');
            if (card.dataset.value == value) {
                card.classList.add('active');
            }
        });
    });
}

/**
 * Renders the template portal view
 */
export function renderTemplatePortal() {
    const container = document.getElementById('template-portal-options');
    if (!container) return;

    container.innerHTML = `
        <div class="hub-option" data-hub-action="new" role="button" tabindex="0">
            <div class="hub-option-icon">🎯</div>
            <div class="hub-option-text">
                <h3>Generate New Plan</h3>
                <p>AI-powered plan based on your current settings</p>
            </div>
        </div>
        <div class="hub-option" data-hub-action="manage" role="button" tabindex="0">
            <div class="hub-option-icon">⚙️</div>
            <div class="hub-option-text">
                <h3>Manage My Plans</h3>
                <p>View, edit, and organize your workout plans</p>
            </div>
        </div>
        <div class="hub-option" data-hub-action="premade" role="button" tabindex="0">
            <div class="hub-option-icon">📋</div>
            <div class="hub-option-text">
                <h3>Browse Templates</h3>
                <p>Choose from proven, ready-made programs</p>
            </div>
        </div>
        <div class="hub-option" data-hub-action="custom" role="button" tabindex="0">
            <div class="hub-option-icon">🛠️</div>
            <div class="hub-option-text">
                <h3>Custom Builder</h3>
                <p>Build your own plan from scratch</p>
            </div>
        </div>
    `;
}

/**
 * Renders the daily workout view
 */
export function renderDailyWorkout() {
    if (!state.activePlanId || !state.currentView || !elements.exerciseListContainer) return;

    const activePlan = state.allPlans.find(p => p.id === state.activePlanId);
    if (!activePlan) return;

    const { week, day } = state.currentView;
    const workout = activePlan.weeks[week]?.[day];
    if (!workout) return;

    // Update header
    const titleElement = document.getElementById('workout-day-title');
    const dateElement = document.getElementById('workout-date');
    if (titleElement) titleElement.textContent = workout.name || `Week ${week}, Day ${day}`;
    if (dateElement) dateElement.textContent = new Date().toLocaleDateString();

    // Show loader
    if (elements.exerciseListLoader) elements.exerciseListLoader.classList.remove('hidden');
    elements.exerciseListContainer.style.display = 'none';

    // Simulate loading delay for better UX
    setTimeout(() => {
        renderExerciseList(workout, week);
        
        // Hide loader and show content
        if (elements.exerciseListLoader) elements.exerciseListLoader.classList.add('hidden');
        elements.exerciseListContainer.style.display = 'block';
    }, 500);
}

/**
 * Renders the exercise list for the current workout
 */
function renderExerciseList(workout, week) {
    if (!elements.exerciseListContainer) return;

    let html = '';
    
    workout.exercises.forEach((exercise, exerciseIndex) => {
        const previousWeekWorkout = state.allPlans.find(p => p.id === state.activePlanId)?.weeks[week - 1]?.[state.currentView.day];
        const previousWeekExercise = previousWeekWorkout?.exercises.find(ex => ex.exerciseId === exercise.exerciseId);

        html += `
            <div class="exercise-card ${exercise.stallCount >= 2 ? 'stalled' : ''}">
                <div class="exercise-card-header">
                    <div class="exercise-title-group">
                        <h3>${exercise.name}</h3>
                        ${exercise.stallCount >= 2 ? '<span class="stall-indicator" title="This exercise has stalled">⚠️</span>' : ''}
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="swap-exercise-btn" data-action="swapExercise" data-exercise-index="${exerciseIndex}" title="Swap Exercise">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z"/>
                                <path d="M8 21v-5a2 2 0 012-2h4a2 2 0 012 2v5"/>
                            </svg>
                        </button>
                        <button class="history-btn" data-action="showHistory" data-exercise-id="${exercise.exerciseId}" title="View History">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="12,6 12,12 16,14"/>
                            </svg>
                        </button>
                        <button class="note-btn ${exercise.note ? 'has-note' : ''}" data-action="openExerciseNotes" data-exercise-index="${exerciseIndex}" title="Exercise Notes">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                <polyline points="14,2 14,8 20,8"/>
                                <line x1="16" y1="13" x2="8" y2="13"/>
                                <line x1="16" y1="17" x2="8" y2="17"/>
                                <polyline points="10,9 9,9 8,9"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="sets-container">
                    <div class="set-row header">
                        <div class="set-number">Set</div>
                        <div class="set-inputs-wrapper">
                            <div class="set-inputs">
                                <span>Weight (${state.settings.units})</span>
                                <span>Reps & RIR</span>
                            </div>
                        </div>
                    </div>
        `;

        // Render existing sets
        for (let setIndex = 0; setIndex < exercise.targetSets; setIndex++) {
            const set = exercise.sets[setIndex] || { weight: '', reps: '', rir: '', rawInput: '' };
            const previousWeekSet = previousWeekExercise?.sets[setIndex];
            
            html += createSetRowHTML(exerciseIndex, setIndex, set, previousWeekSet, exercise.targetReps, exercise.targetRIR, week);
        }

        html += `
                    <button class="add-set-btn" data-action="addSet" data-exercise-index="${exerciseIndex}">+ Add Set</button>
                </div>
            </div>
        `;
    });

    elements.exerciseListContainer.innerHTML = html;
}

/**
 * Renders the performance summary view
 */
export function renderPerformanceSummary() {
    renderTrophyCase();
    renderConsistencyCalendar();
    renderVolumeChart();
    renderExerciseTracker();
    renderWorkoutHistory();
}

/**
 * Renders the trophy case (personal records)
 */
function renderTrophyCase() {
    const container = document.getElementById('trophy-case-list');
    if (!container) return;

    if (state.personalRecords.length === 0) {
        container.innerHTML = '<p class="placeholder-text">No personal records yet. Complete some workouts to start building your trophy case!</p>';
        return;
    }

    const sortedPRs = state.personalRecords.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    container.innerHTML = sortedPRs.map(pr => `
        <div class="pr-item">
            <div class="pr-exercise-name">${pr.exerciseName}</div>
            <div class="pr-details">
                <div class="pr-lift">${pr.weight}${pr.units} × ${pr.reps}</div>
                <div class="pr-e1rm">Est. 1RM: ${pr.e1rm}${pr.units}</div>
            </div>
            <div class="pr-date">${new Date(pr.date).toLocaleDateString()}</div>
        </div>
    `).join('');
}

/**
 * Renders the consistency calendar
 */
function renderConsistencyCalendar() {
    const container = document.getElementById('consistency-calendar');
    if (!container) return;

    // Simple calendar showing last 30 days
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    let html = '<div class="calendar-header">Last 30 Days</div>';
    
    // Day headers
    const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    dayNames.forEach(day => {
        html += `<div class="calendar-day-name">${day}</div>`;
    });

    // Calendar days
    for (let i = 29; i >= 0; i--) {
        const date = new Date(today.getTime() - (i * 24 * 60 * 60 * 1000));
        const dateString = date.toISOString().split('T')[0];
        const hasWorkout = state.workoutHistory.some(w => w.completedDate.startsWith(dateString));
        
        html += `<div class="calendar-day ${hasWorkout ? 'completed' : ''}">${date.getDate()}</div>`;
    }

    container.innerHTML = html;
}

/**
 * Renders the volume chart
 */
function renderVolumeChart() {
    // This would integrate with Chart.js - simplified for now
    console.log('Volume chart rendering would happen here');
}

/**
 * Renders the exercise tracker dropdown and charts
 */
export function renderExerciseTracker() {
    if (!elements.exerciseTrackerSelect) return;

    // Get unique exercises from workout history
    const exercises = new Set();
    state.workoutHistory.forEach(workout => {
        workout.exercises.forEach(ex => {
            if (ex.sets && ex.sets.length > 0) {
                exercises.add(ex.name);
            }
        });
    });

    const exerciseArray = Array.from(exercises).sort();
    
    elements.exerciseTrackerSelect.innerHTML = `
        <option value="">Select an exercise...</option>
        ${exerciseArray.map(name => `<option value="${name}">${name}</option>`).join('')}
    `;
}

/**
 * Renders progress chart for a specific exercise
 */
export function renderProgressChart(exerciseName) {
    if (state.progressChart) {
        state.progressChart.destroy();
    }
    const chartData = getChartDataForExercise(exerciseName, 'weight');
    if (chartData.labels.length > 0) {
        state.progressChart = new Chart(elements.weightProgressChart, {
            type: 'line',
            data: chartData,
            options: getChartOptions(`Top Set Weight (${state.settings.units})`)
        });
    }
}

/**
 * Renders E1RM chart for a specific exercise
 */
export function renderE1RMChart(exerciseName) {
    if (state.e1rmChart) {
        state.e1rmChart.destroy();
    }
    const chartData = getChartDataForExercise(exerciseName, 'e1rm');
    if (chartData.labels.length > 0) {
        state.e1rmChart = new Chart(elements.e1rmProgressChart, {
            type: 'line',
            data: chartData,
            options: getChartOptions(`Estimated 1-Rep Max (${state.settings.units})`)
        });
    }
}

/**
 * Renders the workout history list
 */
function renderWorkoutHistory() {
    const container = document.getElementById('workout-history-list');
    if (!container) return;

    if (state.workoutHistory.length === 0) {
        container.innerHTML = '<p class="placeholder-text">No completed workouts yet.</p>';
        return;
    }

    const recentWorkouts = state.workoutHistory.slice(0, 10);
    
    container.innerHTML = recentWorkouts.map(workout => `
        <div class="summary-item">
            <div>
                <h4>${workout.workoutName}</h4>
                <p>${new Date(workout.completedDate).toLocaleDateString()} • ${Math.floor(workout.duration / 60)}min</p>
            </div>
            <div style="text-align: right;">
                <h4>${workout.volume.toLocaleString()} ${state.settings.units}</h4>
                <p>${workout.sets} sets</p>
            </div>
        </div>
    `).join('');
}

/**
 * Renders the settings view
 */
export function renderSettings() {
    renderPlanManagement();
    updateSettingsSelections();
}

/**
 * Renders the plan management section
 */
function renderPlanManagement() {
    const container = document.getElementById('plan-management-list');
    if (!container) return;

    if (state.allPlans.length === 0) {
        container.innerHTML = '<p class="placeholder-text">No plans created yet.</p>';
        return;
    }

    container.innerHTML = state.allPlans.map(plan => `
        <div class="plan-item ${plan.id === state.activePlanId ? 'active' : ''}">
            <div class="plan-name-text" data-action="setActivePlan" data-plan-id="${plan.id}">
                ${plan.name}
            </div>
            <div class="plan-actions">
                <button class="plan-btn secondary-button" data-action="startPlanWorkout" data-plan-id="${plan.id}">Start</button>
                <button class="plan-btn secondary-button" data-action="editPlan" data-plan-id="${plan.id}">Edit</button>
                <button class="plan-btn secondary-button" data-action="confirmDeletePlan" data-plan-id="${plan.id}">Delete</button>
            </div>
        </div>
    `).join('');
}

/**
 * Updates settings UI selections
 */
function updateSettingsSelections() {
    // Update goal cards
    updateCardSelection('settings-goal-cards', 'goal', state.userSelections.goal);
    updateCardSelection('settings-experience-cards', 'trainingAge', state.userSelections.trainingAge);
    
    // Update toggle switches
    updateToggleSwitch('progression-model-switch', state.settings.progressionModel);
    updateToggleSwitch('weight-increment-switch', state.settings.weightIncrement);
    updateToggleSwitch('rest-duration-switch', state.settings.restDuration);
    updateToggleSwitch('units-switch', state.settings.units);
    updateToggleSwitch('theme-switch', state.settings.theme);
}

/**
 * Updates card selection UI
 */
function updateCardSelection(containerId, field, value) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const cards = container.querySelectorAll('.goal-card');
    cards.forEach(card => {
        card.classList.remove('active');
        if (card.dataset.value == value) {
            card.classList.add('active');
        }
    });
}

/**
 * Updates toggle switch UI
 */
function updateToggleSwitch(switchId, activeValue) {
    const switchContainer = document.getElementById(switchId);
    if (!switchContainer) return;

    const buttons = switchContainer.querySelectorAll('.toggle-btn');
    buttons.forEach(btn => {
        btn.classList.remove('active');
        const btnValue = btn.dataset.progression || btn.dataset.increment || btn.dataset.duration || btn.dataset.unit || btn.dataset.theme;
        if (btnValue == activeValue) {
            btn.classList.add('active');
        }
    });
}

/**
 * Formats a number for display as a comparison (e.g., +100, -50).
 * @param {number} value - The number to format.
 * @returns {string} The formatted string with a class for color.
 */
function formatComparison(value) {
    if (value === null || value === undefined) return '';
    const sign = value > 0 ? '+' : '';
    const className = value > 0 ? 'positive' : (value < 0 ? 'negative' : 'neutral');
    return `<span class="comparison ${className}">(${sign}${value.toLocaleString()})</span>`;
}

/**
 * Renders the workout summary view
 */
export function renderWorkoutSummary() {
    const summary = state.workoutSummary;
    
    // Update stats with comparisons
    updateElementHTML('summary-time', `${formatTime(state.workoutTimer.elapsed)} ${formatComparison(summary.durationChange)}`);
    updateElementHTML('summary-volume', `${summary.totalVolume.toLocaleString()} ${state.settings.units} ${formatComparison(summary.volumeChange)}`);
    updateElementHTML('summary-sets', `${summary.totalSets} ${formatComparison(summary.setsChange)}`);
    updateElement('summary-prs', summary.newPRs);
    
    // Update mesocycle stats
    updateElement('summary-meso-completed', summary.mesocycleStats.completed || 0);
    updateElement('summary-meso-incomplete', summary.mesocycleStats.incomplete || 0);
    
    // Update suggestions
    const suggestionsContainer = document.getElementById('summary-progression-list');
    if (suggestionsContainer) {
        if (summary.suggestions.length === 0) {
            suggestionsContainer.innerHTML = '<p class="placeholder-text">No suggestions right now. Great work!</p>';
        } else {
            suggestionsContainer.innerHTML = summary.suggestions.map(suggestion => `
                <div class="summary-item">
                    <h4>${suggestion.exerciseName}</h4>
                    <p>${suggestion.suggestion}</p>
                </div>
            `).join('');
        }
    }

    // Trigger confetti and show PR badge if new PRs were achieved
    if (summary.newPRs > 0) {
        const prCard = document.querySelector('#summary-prs').closest('.stat-card');
        if (prCard && !prCard.querySelector('.pr-badge')) {
            const badge = document.createElement('div');
            badge.className = 'pr-badge';
            badge.textContent = 'PR!';
            prCard.appendChild(badge);
        }
        startConfetti();
    }
}


/**
 * Helper function to update element text content
 */
function updateElement(id, content) {
    const element = document.getElementById(id);
    if (element) element.textContent = content;
}

/**
 * Helper function to update element inner HTML
 */
function updateElementHTML(id, content) {
    const element = document.getElementById(id);
    if (element) element.innerHTML = content;
}


/**
 * Formats time in seconds to MM:SS format
 */
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Updates the stopwatch display
 */
export function updateStopwatchDisplay() {
    if (!elements.workoutStopwatchDisplay) return;
    
    if (state.workoutTimer.isRunning) {
        const elapsed = Math.floor((Date.now() - state.workoutTimer.startTime) / 1000);
        state.workoutTimer.elapsed = elapsed;
        elements.workoutStopwatchDisplay.textContent = formatTime(elapsed);
    } else {
        elements.workoutStopwatchDisplay.textContent = formatTime(state.workoutTimer.elapsed);
    }
}

/**
 * Updates the rest timer display
 */
export function updateRestTimerDisplay() {
    if (!elements.restTimerDisplay) return;
    
    const remaining = Math.max(0, state.restTimer.remaining);
    elements.restTimerDisplay.textContent = formatTime(remaining);
    
    if (remaining === 0 && state.restTimer.isRunning) {
        elements.restTimerDisplay.style.color = 'var(--color-state-success)';
    } else {
        elements.restTimerDisplay.style.color = 'var(--color-accent-primary)';
    }
}

/**
 * Displays intra-workout recommendations
 */
export function displayIntraWorkoutRecommendation(exerciseIndex, setIndex, recommendation) {
    const recommendationElement = document.querySelector(`[data-exercise-index="${exerciseIndex}"][data-set-index="${setIndex}"].recommendation-text`);
    if (recommendationElement && recommendation) {
        recommendationElement.textContent = recommendation;
        recommendationElement.style.color = 'var(--color-accent-secondary)';
        recommendationElement.style.fontSize = '0.85rem';
        recommendationElement.style.marginTop = '0.5rem';
    }
}

/**
 * Shows a modal dialog
 */
export function showModal(title, content, actions = []) {
    if (!elements.modal) return;

    const modalBody = document.getElementById('modal-body');
    const modalActions = document.getElementById('modal-actions');

    if (modalBody) {
        modalBody.innerHTML = typeof content === 'string' 
            ? `<h2>${title}</h2><div>${content}</div>` 
            : `<h2>${title}</h2>`;
        
        if (typeof content !== 'string') {
            modalBody.appendChild(content);
        }
    }

    if (modalActions) {
        // Clear previous actions
        modalActions.innerHTML = '';
        
        // Create buttons and attach event listeners
        actions.forEach((action, index) => {
            const button = document.createElement('button');
            button.className = action.class;
            button.textContent = action.text;
            
            if (action.action) {
                // Attach the event listener directly
                button.addEventListener('click', action.action);
            } else {
                // Default action is to close the modal
                button.dataset.action = 'closeModal';
            }
            
            modalActions.appendChild(button);
        });
    }

    elements.modal.classList.add('active');
}


/**
 * Closes the modal dialog
 */
export function closeModal() {
    if (elements.modal) {
        elements.modal.classList.remove('active');
    }
}

/**
 * Shows the feedback modal
 */
export function showFeedbackModal(title, question, options) {
    if (!elements.feedbackModal) return;

    const titleElement = document.getElementById('feedback-modal-title');
    const questionElement = document.getElementById('feedback-modal-question');
    const optionsContainer = document.getElementById('feedback-modal-options');

    if (titleElement) titleElement.textContent = title;
    if (questionElement) questionElement.textContent = question;
    if (optionsContainer) {
        optionsContainer.innerHTML = options.map(option => 
            `<button class="cta-button" data-action="${option.action}" data-value="${option.value}">${option.text}</button>`
        ).join('');
    }

    elements.feedbackModal.classList.add('active');
}

/**
 * Closes the feedback modal
 */
export function closeFeedbackModal() {
    if (elements.feedbackModal) {
        elements.feedbackModal.classList.remove('active');
    }
}

/**
 * Shows the daily check-in modal
 */
export function showDailyCheckinModal() {
    if (!elements.dailyCheckinModal) return;
    elements.dailyCheckinModal.classList.add('active');
}

/**
 * Closes the daily check-in modal
 */
export function closeDailyCheckinModal() {
    if (elements.dailyCheckinModal) {
        elements.dailyCheckinModal.classList.remove('active');
    }
}

/**
 * Shows a tooltip
 */
export function showTooltip(element) {
    const tooltipText = element.getAttribute('data-tooltip');
    if (!tooltipText) return;

    // Remove existing tooltip
    hideTooltip();

    // Create new tooltip
    currentTooltip = document.createElement('div');
    currentTooltip.className = 'tooltip active';
    currentTooltip.textContent = tooltipText;
    document.body.appendChild(currentTooltip);

    // Position tooltip
    const rect = element.getBoundingClientRect();
    currentTooltip.style.left = rect.left + (rect.width / 2) - (currentTooltip.offsetWidth / 2) + 'px';
    currentTooltip.style.top = rect.top - currentTooltip.offsetHeight - 10 + 'px';
}

/**
 * Hides the current tooltip
 */
export function hideTooltip() {
    if (currentTooltip) {
        currentTooltip.remove();
        currentTooltip = null;
    }
}

// --- NEW CONFETTI LOGIC ---

function startConfetti() {
    const canvas = elements.confettiCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const confettiPieces = [];
    const numberOfPieces = 100;
    const colors = ['#FF7A00', '#00bfff', '#48bb78', '#e2e8f0'];

    for (let i = 0; i < numberOfPieces; i++) {
        confettiPieces.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            size: Math.random() * 10 + 5,
            color: colors[Math.floor(Math.random() * colors.length)],
            speed: Math.random() * 3 + 2,
            angle: Math.random() * 2 * Math.PI,
            tilt: Math.random() * 10,
            tiltAngle: 0,
            tiltAngleSpeed: Math.random() * 0.1 + 0.05
        });
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        confettiPieces.forEach(piece => {
            ctx.beginPath();
            ctx.lineWidth = piece.size;
            ctx.strokeStyle = piece.color;
            ctx.moveTo(piece.x + piece.tilt, piece.y);
            ctx.lineTo(piece.x, piece.y + piece.tilt + piece.size);
            ctx.stroke();
        });
        update();
    }

    function update() {
        confettiPieces.forEach(piece => {
            piece.y += piece.speed;
            piece.tiltAngle += piece.tiltAngleSpeed;
            piece.tilt = Math.sin(piece.tiltAngle) * 15;
            if (piece.y > canvas.height) {
                piece.x = Math.random() * canvas.width;
                piece.y = -20;
            }
        });
    }

    function animate() {
        draw();
        confettiAnimationId = requestAnimationFrame(animate);
    }

    animate();
}

function stopConfetti() {
    if (confettiAnimationId) {
        cancelAnimationFrame(confettiAnimationId);
    }
    const canvas = elements.confettiCanvas;
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

/**
 * NEW: Shows a toast notification at the bottom of the screen.
 * @param {string} message - The message to display.
 * @param {string} type - The type of toast ('info', 'success', 'warning', 'error').
 */
export function showToast(message, type = 'info') {
    if (!elements.toast) return;

    clearTimeout(toastTimeout);

    elements.toastMessage.textContent = message;
    
    const icons = {
        success: '✅',
        warning: '⚠️',
        error: '❌',
        info: 'ℹ️'
    };
    elements.toastIcon.textContent = icons[type] || icons.info;

    elements.toast.className = `toast show ${type}`;

    toastTimeout = setTimeout(() => {
        elements.toast.className = elements.toast.className.replace('show', '');
    }, 4000);
}

// --- NEW CHARTING LOGIC ---

/**
 * Gets the common chart options for the app's theme.
 * @param {string} title - The title of the chart.
 * @returns {object} A Chart.js options object.
 */
function getChartOptions(title) {
    const isDarkMode = state.settings.theme === 'dark';
    const textColor = isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: {
                display: true,
                text: title,
                color: textColor,
                font: { size: 16, family: 'Poppins' }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: { color: textColor },
                grid: { color: gridColor }
            },
            x: {
                ticks: { color: textColor },
                grid: { color: gridColor }
            }
        }
    };
}

/**
 * Extracts and prepares data for a specific exercise chart.
 * @param {string} exerciseName - The name of the exercise.
 * @param {string} metric - The metric to plot ('weight' or 'e1rm').
 * @returns {object} A Chart.js data object.
 */
function getChartDataForExercise(exerciseName, metric = 'weight') {
    const labels = [];
    const data = [];

    state.workoutHistory
        .filter(entry => entry.exercises.some(ex => ex.name === exerciseName))
        .sort((a, b) => new Date(a.completedDate) - new Date(b.completedDate))
        .forEach(entry => {
            const exercise = entry.exercises.find(ex => ex.name === exerciseName);
            if (!exercise || !exercise.sets || exercise.sets.length === 0) return;

            let value;
            if (metric === 'weight') {
                const topSet = exercise.sets.reduce((max, set) => (set.weight > max.weight ? set : max), { weight: 0 });
                value = topSet.weight;
            } else { // e1rm
                const topSet = exercise.sets.reduce((max, set) => {
                    const currentE1RM = (set.weight || 0) * (1 + (set.reps || 0) / 30);
                    const maxE1RM = (max.weight || 0) * (1 + (max.reps || 0) / 30);
                    return currentE1RM > maxE1RM ? set : max;
                }, { weight: 0, reps: 0 });
                value = Math.round(topSet.weight * (1 + topSet.reps / 30));
            }
            
            if (value > 0) {
                labels.push(new Date(entry.completedDate).toLocaleDateString());
                data.push(value);
            }
        });

    return {
        labels,
        datasets: [{
            label: exerciseName,
            data,
            fill: false,
            borderColor: 'rgba(0, 191, 255, 1)',
            tension: 0.1
        }]
    };
}
