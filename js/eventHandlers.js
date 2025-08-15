// js/eventHandlers.js - Updated for Google Sheets
import { state } from './state.js';
import * as ui from './ui.js';
import * as googleSheets from './googleSheetsService.js';
import { workoutEngine } from './planGenerator.js';
import { sanitizeInput, findLastPerformance } from './utils.js';

/**
 * @file eventHandlers.js centralizes all application event listeners and their corresponding actions.
 * It acts as the "controller" of the application, responding to user input and interfacing with the workoutEngine.
 * Updated to use Google Sheets instead of Firebase.
 */

// --- UTILITY FUNCTIONS ---

/**
 * Provides haptic feedback if the browser supports it.
 * @param {string} type - The type of feedback ('light', 'medium', 'heavy', 'success', 'error').
 */
function triggerHapticFeedback(type = 'light') {
    if (!navigator.vibrate || state.settings.haptics === false) return;

    const patterns = {
        light: [40],
        medium: [80],
        heavy: [120],
        success: [50, 100, 50],
        error: [100, 50, 100],
    };

    navigator.vibrate(patterns[type] || patterns.light);
}

// --- ACTION FUNCTIONS ---

function findAndSetNextWorkout(planId = state.activePlanId) {
    const plan = state.allPlans.find(p => p.id === planId);
    if (!plan || !plan.weeks) {
        ui.showModal("No Active Plan", "You don't have an active workout plan. Please create one to get started.");
        return false;
    }

    const sortedWeeks = Object.keys(plan.weeks).sort((a, b) => a - b);

    for (const weekKey of sortedWeeks) {
        const week = plan.weeks[weekKey];
        const sortedDays = Object.keys(week).sort((a, b) => a - b);

        for (const dayKey of sortedDays) {
            const workout = week[dayKey];
            if (!workout.completed) {
                state.currentView = { week: parseInt(weekKey), day: parseInt(dayKey) };
                return true;
            }
        }
    }

    ui.showModal("Plan Complete!", "Congratulations! You've completed all the workouts in this plan. You can start a new one from the template portal.", [{ text: 'Go to Template Portal', class: 'cta-button', action: () => ui.showView('templatePortal') }]);
    return false;
}

async function selectCard(element, field, value, shouldSave = false) {
    triggerHapticFeedback('medium');
    const processedValue = /^\d+$/.test(value) ? parseInt(value) : value;
    state.userSelections[field] = processedValue;
    
    element.closest('.card-group').querySelectorAll('.goal-card').forEach(card => card.classList.remove('active'));
    element.classList.add('active');

    if (shouldSave) {
        await googleSheets.updateState('userSelections', state.userSelections);
    }
}

async function setTheme(theme) {
    if (theme !== 'dark' && theme !== 'light') return;
    triggerHapticFeedback('light');
    state.settings.theme = theme;
    ui.applyTheme();
    await googleSheets.updateState('settings', state.settings);
    ui.renderSettings();
}

async function setUnits(unit) {
    if (unit !== 'lbs' && unit !== 'kg') return;
    triggerHapticFeedback('light');
    state.settings.units = unit;
    await googleSheets.updateState('settings', state.settings);
    ui.renderSettings();
    if (state.currentViewName === 'workout') {
        ui.renderDailyWorkout();
    }
}

async function setProgressionModel(progression) {
    if (progression !== 'linear' && progression !== 'double') return;
    triggerHapticFeedback('light');
    state.settings.progressionModel = progression;
    await googleSheets.updateState('settings', state.settings);
    ui.renderSettings();
}

async function setWeightIncrement(increment) {
    if (![2.5, 5, 10].includes(increment)) return;
    triggerHapticFeedback('light');
    state.settings.weightIncrement = increment;
    await googleSheets.updateState('settings', state.settings);
    ui.renderSettings();
}

async function setRestDuration(duration) {
    if (![60, 90, 120, 180].includes(duration)) return;
    triggerHapticFeedback('light');
    state.settings.restDuration = duration;
    state.restTimer.remaining = duration;
    await googleSheets.updateState('settings', state.settings);
    ui.renderSettings();
    if (state.currentViewName === 'workout') {
        ui.updateRestTimerDisplay();
    }
}

function confirmDeletePlan(planId) {
    triggerHapticFeedback('medium');
    ui.showModal('Delete Plan?', 'Are you sure you want to permanently delete this plan? This cannot be undone.', [
        { text: 'Cancel', class: 'secondary-button' },
        { text: 'Yes, Delete', class: 'cta-button', action: () => deletePlan(planId) }
    ]);
}

async function deletePlan(planId) {
    triggerHapticFeedback('error');
    state.allPlans = state.allPlans.filter(p => p.id !== planId);
    if (state.activePlanId === planId) {
        state.activePlanId = state.allPlans.length > 0 ? state.allPlans[0].id : null;
    }
    await googleSheets.saveFullState();
    ui.closeModal();
    ui.renderSettings();
}

async function setActivePlan(planId) {
    triggerHapticFeedback('success');
    state.activePlanId = planId;
    await googleSheets.updateState('activePlanId', state.activePlanId);
    ui.renderSettings();
}

function confirmCompleteWorkout() {
    triggerHapticFeedback('medium');
    ui.showModal('Complete Workout?', 'Are you sure you want to complete this workout? This action cannot be undone.', [
        { text: 'Cancel', class: 'secondary-button' },
        { text: 'Yes, Complete', class: 'cta-button', action: () => completeWorkout() }
    ]);
}

function calculateE1RM(weight, reps) {
    if (!weight || !reps || reps < 1) return 0;
    if (reps === 1) return Math.round(weight);
    return Math.round(weight * (1 + reps / 30));
}

function checkForPRs(completedWorkout) {
    let newPRsCount = 0;
    completedWorkout.exercises.forEach(ex => {
        if (!ex.sets || ex.sets.length === 0) return;

        const topSetOfTheSession = ex.sets.reduce((best, current) => {
            if (!current.weight || !current.reps) return best;
            const currentE1RM = calculateE1RM(current.weight, current.reps);
            return currentE1RM > best.e1rm ? { ...current, e1rm: currentE1RM } : best;
        }, { e1rm: 0 });

        if (topSetOfTheSession.e1rm === 0) return;

        const existingPR = state.personalRecords.find(pr => pr.exerciseId === ex.exerciseId);

        if (!existingPR || topSetOfTheSession.e1rm > existingPR.e1rm) {
            newPRsCount++;
            const newPR = {
                id: `pr_${ex.exerciseId}_${Date.now()}`,
                exerciseId: ex.exerciseId,
                exerciseName: ex.name,
                date: new Date().toISOString(),
                weight: topSetOfTheSession.weight,
                reps: topSetOfTheSession.reps,
                e1rm: topSetOfTheSession.e1rm,
                units: state.settings.units
            };
            state.personalRecords = state.personalRecords.filter(pr => pr.exerciseId !== ex.exerciseId);
            state.personalRecords.push(newPR);
        }
    });
    return newPRsCount;
}

/**
 * Finds the most recent previous instance of the same workout.
 * @param {string} planId - The ID of the current plan.
 * @param {string} workoutName - The name of the workout to find.
 * @returns {object|null} The previous workout history entry, or null if not found.
 */
function findPreviousWorkout(planId, workoutName) {
    return state.workoutHistory.find(entry => entry.planId === planId && entry.workoutName === workoutName) || null;
}

async function completeWorkout() {
    triggerHapticFeedback('success');
    stopStopwatch();
    ui.closeModal();

    const planIndex = state.allPlans.findIndex(p => p.id === state.activePlanId);
    if (planIndex === -1) return;

    const activePlan = state.allPlans[planIndex];
    const { week, day } = state.currentView;
    const workout = activePlan.weeks[week][day];

    workout.completed = true;
    workout.completedDate = new Date().toISOString();
    
    state.workoutTimer.isWorkoutInProgress = false;
    
    const newPRsCount = checkForPRs(workout);
    state.workoutSummary.newPRs = newPRsCount;

    const totalSeconds = state.workoutTimer.elapsed;
    const totalVolume = workout.exercises.reduce((sum, ex) => sum + (ex.sets || []).reduce((total, set) => total + (set.weight || 0) * (set.reps || 0), 0), 0);
    const totalSets = workout.exercises.reduce((sum, ex) => sum + (ex.sets?.length || 0), 0);

    // Compare with previous workout
    const previousWorkout = findPreviousWorkout(activePlan.id, workout.name);
    if (previousWorkout) {
        state.workoutSummary.volumeChange = totalVolume - previousWorkout.volume;
        state.workoutSummary.setsChange = totalSets - previousWorkout.sets;
        state.workoutSummary.durationChange = totalSeconds - previousWorkout.duration;
    } else {
        state.workoutSummary.volumeChange = null;
        state.workoutSummary.setsChange = null;
        state.workoutSummary.durationChange = null;
    }

    state.workoutSummary.totalVolume = totalVolume;
    state.workoutSummary.totalSets = totalSets;
    state.workoutSummary.mesocycleStats = calculateMesocycleStats();

    const historyEntry = {
        id: `hist_${Date.now()}`,
        planId: activePlan.id,
        planName: activePlan.name,
        workoutName: workout.name,
        completedDate: new Date().toISOString(),
        duration: totalSeconds,
        volume: totalVolume,
        sets: totalSets,
        exercises: JSON.parse(JSON.stringify(workout.exercises))
    };
    state.workoutHistory.unshift(historyEntry);

    const nextWeekWorkout = activePlan.weeks[week + 1]?.[day];
    if (nextWeekWorkout) {
        workoutEngine.calculateNextWorkoutProgression(workout, nextWeekWorkout);
        state.workoutSummary.suggestions = generateProgressionSuggestions(workout, nextWeekWorkout);
    } else {
        state.workoutSummary.suggestions = [];
    }
    
    ui.showView('workoutSummary');
    findAndSetNextWorkout();
    await googleSheets.saveFullState();
}

function generateProgressionSuggestions(completedWorkout, nextWeekWorkout) {
    if (!nextWeekWorkout) return [];
    const suggestions = [];
    completedWorkout.exercises.forEach(completedEx => {
        const nextWeekEx = nextWeekWorkout.exercises.find(ex => ex.exerciseId === completedEx.exerciseId);
        if (!nextWeekEx) return;

        if (nextWeekEx.stallCount >= 2) {
            suggestions.push({
                exerciseName: nextWeekEx.name,
                suggestion: `You've stalled on this lift. Consider swapping it for an alternative to break through the plateau.`
            });
            return; 
        }

        const topSet = completedEx.sets.reduce((max, set) => ((set.weight || 0) > (max.weight || 0) ? set : max), { weight: 0 });
        
        let suggestionText = `Maintain ${nextWeekEx.targetLoad || topSet.weight || 'current'} ${state.settings.units} for ${nextWeekEx.targetReps} reps.`;

        if (nextWeekEx.targetLoad > (topSet.weight || 0)) {
            suggestionText = `Increase to <strong>${nextWeekEx.targetLoad} ${state.settings.units}</strong> for ${nextWeekEx.targetReps} reps.`;
        } else if (nextWeekEx.targetReps > completedEx.targetReps) {
            suggestionText = `Aim for <strong>${nextWeekEx.targetReps} reps</strong> with ${topSet.weight || 'the same'} ${state.settings.units}.`;
        }
        
        suggestions.push({
            exerciseName: completedEx.name,
            suggestion: suggestionText
        });
    });
    return suggestions;
}

function calculateMesocycleStats() {
    const activePlan = state.allPlans.find(p => p.id === state.activePlanId);
    if (!activePlan) return { total: 0, completed: 0, incomplete: 0 };

    let total = 0;
    let completed = 0;

    Object.values(activePlan.weeks).forEach(week => {
        Object.values(week).forEach(day => {
            if (day.exercises && day.exercises.length > 0) {
                total++;
                if (day.completed) {
                    completed++;
                }
            }
        });
    });

    return { total, completed, incomplete: total - completed };
}

function setChartType(chartType) {
    triggerHapticFeedback('light');
    const weightContainer = ui.elements.weightChartContainer;
    const e1rmContainer = ui.elements.e1rmChartContainer;
    const toggleButtons = document.querySelectorAll('.chart-toggle-switch .toggle-btn');

    toggleButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.chartType === chartType);
    });

    weightContainer.classList.toggle('hidden', chartType !== 'weight');
    e1rmContainer.classList.toggle('hidden', chartType !== 'e1rm');
}

// --- TIMER FUNCTIONS ---

function startStopwatch() {
    if (state.workoutTimer.isRunning) return;
    state.workoutTimer.isRunning = true;
    state.workoutTimer.startTime = Date.now() - (state.workoutTimer.elapsed * 1000);
    state.workoutTimer.instance = setInterval(ui.updateStopwatchDisplay, 1000);
}

function stopStopwatch() {
    if (!state.workoutTimer.isRunning) return;
    state.workoutTimer.isRunning = false;
    clearInterval(state.workoutTimer.instance);
    state.workoutTimer.elapsed = Math.floor((Date.now() - state.workoutTimer.startTime) / 1000);
    ui.updateStopwatchDisplay();
}

function startRestTimer() {
    triggerHapticFeedback('light');
    if (state.restTimer.isRunning) return;
    stopRestTimer();
    state.restTimer.isRunning = true;
    state.restTimer.remaining = state.settings.restDuration;
    ui.updateRestTimerDisplay();
    state.restTimer.instance = setInterval(() => {
        state.restTimer.remaining--;
        ui.updateRestTimerDisplay();
        if (state.restTimer.remaining <= 0) {
            stopRestTimer();
            triggerHapticFeedback('success');
        }
    }, 1000);
}

function stopRestTimer() {
    clearInterval(state.restTimer.instance);
    state.restTimer.isRunning = false;
    state.restTimer.remaining = state.settings.restDuration;
    ui.updateRestTimerDisplay();
}

// --- NOTE AND HISTORY FUNCTIONS ---

function openExerciseNotes(exerciseIndex) {
    const activePlan = state.allPlans.find(p => p.id === state.activePlanId);
    const workout = activePlan.weeks[state.currentView.week][state.currentView.day];
    const exercise = workout.exercises[exerciseIndex];
    const note = exercise.note || '';

    ui.showModal(
        `Notes for ${exercise.name}`,
        `<textarea id="exercise-note-input" class="modal-input modal-textarea" placeholder="e.g., Felt strong, focus on form...">${note}</textarea>`,
        [
            { text: 'Cancel', class: 'secondary-button' },
            {
                text: 'Save Note',
                class: 'cta-button',
                action: () => {
                    const newNote = document.getElementById('exercise-note-input').value;
                    exercise.note = sanitizeInput(newNote); 
                    ui.renderDailyWorkout();
                    ui.closeModal();
                    triggerHapticFeedback('success');
                }
            }
        ]
    );
}

function showHistory(exerciseId) {
    const exerciseName = state.exercises.find(ex => `ex_${ex.name.replace(/\s+/g, '_')}` === exerciseId)?.name || "Exercise";
    let historyHTML = '';

    state.workoutHistory.forEach(historyItem => {
        const exerciseInstance = historyItem.exercises?.find(ex => ex.exerciseId === exerciseId);
        if (exerciseInstance && (exerciseInstance.sets?.length > 0 || exerciseInstance.note)) {
            historyHTML += `<div class="history-item">`;
            historyHTML += `<div class="history-date">${new Date(historyItem.completedDate).toLocaleDateString()} - ${historyItem.workoutName}</div>`;
            if (exerciseInstance.note) {
                historyHTML += `<div class="history-note">"${exerciseInstance.note}"</div>`;
            }
            (exerciseInstance.sets || []).forEach((set, index) => {
                if (set.weight && set.reps) {
                    historyHTML += `<div class="history-performance">Set ${index + 1}: ${set.weight}${state.settings.units} x ${set.reps} reps</div>`;
                }
            });
            historyHTML += `</div>`;
        }
    });

    if (!historyHTML) {
        historyHTML = '<p class="placeholder-text">No completed history for this exercise yet.</p>';
    }

    ui.showModal(`${exerciseName} History`, historyHTML, [{ text: 'Close', class: 'cta-button' }]);
}

/**
 * Creates and downloads a JSON file containing the user's data.
 */
function exportData() {
    const userData = {
        userSelections: state.userSelections,
        settings: state.settings,
        allPlans: state.allPlans,
        workoutHistory: state.workoutHistory,
        personalRecords: state.personalRecords,
        savedTemplates: state.savedTemplates,
        dailyCheckinHistory: state.dailyCheckinHistory
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(userData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "progression_backup_" + new Date().toISOString().slice(0,10) + ".json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    ui.showModal("Backup Complete!", "Your workout data has been successfully downloaded. Keep this file safe!", [{ text: 'OK', class: 'cta-button' }]);
}

function confirmResetApp() {
    ui.showModal('Reset All Data?', 'Are you sure you want to permanently delete all your data and start over? This cannot be undone.', [
        { text: 'Cancel', class: 'secondary-button' },
        { text: 'Yes, Reset', class: 'cta-button', action: () => resetAppData() }
    ]);
}

async function resetAppData() {
    triggerHapticFeedback('error');
    state.userSelections = {
        goal: 'hypertrophy',
        trainingAge: 'beginner',
        daysPerWeek: 4,
        dietaryStatus: 'maintenance',
        style: 'gym',
        onboardingCompleted: false,
    };
    state.settings = {
        units: 'lbs',
        theme: 'dark',
        progressionModel: 'double',
        weightIncrement: 5,
        restDuration: 90,
        haptics: true,
    };
    state.allPlans = [];
    state.activePlanId = null;
    state.editingPlanId = null;
    state.workoutHistory = [];
    state.personalRecords = [];
    state.dailyCheckinHistory = [];
    state.currentView = { week: 1, day: 1 };
    state.workoutTimer.isWorkoutInProgress = false;

    await googleSheets.saveFullState();
    ui.closeModal();
    let maxAttempts = 20;
    while (!state.isDataLoaded && maxAttempts > 0) {
        await new Promise(resolve => setTimeout(resolve, 250));
        maxAttempts--;
    }
    ui.showView('onboarding');
}

// --- ONBOARDING FUNCTIONS ---

function handleStepTransition(stepChangeLogic) {
    const currentStepEl = document.querySelector('.step.active');
    if (currentStepEl) {
        currentStepEl.classList.add('fade-out');
        setTimeout(() => {
            stepChangeLogic();
            ui.renderOnboardingStep();
        }, 500); 
    } else {
        stepChangeLogic();
        ui.renderOnboardingStep();
    }
}

function selectOnboardingCard(element, field, value) {
    selectCard(element, field, value);
    setTimeout(nextOnboardingStep, 250);
}

async function nextOnboardingStep() {
    handleStepTransition(async () => {
        if (state.onboarding.currentStep < state.onboarding.totalSteps) {
            state.onboarding.currentStep++;
        }
        
        if (state.onboarding.currentStep === state.onboarding.totalSteps) {
            const newMeso = workoutEngine.generateNewMesocycle(state.userSelections, state.exercises, 4);
            const newPlan = {
                id: `meso_${Date.now()}`,
                name: "My First Intelligent Plan",
                startDate: new Date().toISOString(),
                durationWeeks: 4,
                ...newMeso
            };
            
            state.allPlans.push(newPlan);
            state.activePlanId = newPlan.id;
            state.userSelections.onboardingCompleted = true;
            
            await googleSheets.saveFullState();
            
            let maxAttempts = 20;
            while (!state.isDataLoaded && maxAttempts > 0) {
                await new Promise(resolve => setTimeout(resolve, 250));
                maxAttempts--;
            }

            if (state.isDataLoaded) {
                 triggerHapticFeedback('success');
                 ui.showModal(
                    'Plan Generated!',
                    'Your first intelligent workout plan is ready. You can view it in settings or start your first workout from the home screen.',
                    [{ 
                        text: 'Let\'s Go!', 
                        class: 'cta-button', 
                        action: () => {
                            ui.closeModal();
                            ui.showView('home');
                        } 
                    }]
                );
            } else {
                ui.showModal(
                    'Error', 
                    'There was an error loading your data. Please refresh the page.',
                    [{ text: 'Refresh', class: 'cta-button', action: () => window.location.reload() }]
                );
            }
        }
    });
}

function previousOnboardingStep() {
    handleStepTransition(() => {
        if (state.onboarding.currentStep > 1) {
            state.onboarding.currentStep--;
        }
    });
}

// --- FEEDBACK TRIGGER LOGIC ---

function triggerFeedbackModals(exercise, exerciseIndex, workout) {
    // This logic can be expanded in the future
}

async function submitCheckin() {
    triggerHapticFeedback('success');
    state.dailyCheckin.sleep = parseFloat(ui.elements.sleepSlider.value);
    state.dailyCheckin.stress = parseInt(ui.elements.stressSlider.value);
    
    state.dailyCheckinHistory.push({
        date: new Date().toISOString(),
        ...state.dailyCheckin
    });

    await googleSheets.updateState('dailyCheckinHistory', state.dailyCheckinHistory);

    const wasAdjusted = workoutEngine.adjustWorkoutForRecovery(state.dailyCheckin.sleep, state.dailyCheckin.stress);
    if (wasAdjusted) {
        ui.showToast("Recovery is low. Workout volume adjusted.", "warning");
    }

    ui.closeDailyCheckinModal();

    state.workoutTimer.isWorkoutInProgress = true;
    if (!state.workoutTimer.isRunning) startStopwatch();
    ui.showView('workout');
}

async function startPlanWorkout(planId) {
    triggerHapticFeedback('medium');
    state.activePlanId = planId;
    await googleSheets.updateState('activePlanId', state.activePlanId);
    const workoutFound = findAndSetNextWorkout(planId);
    if (workoutFound) {
        if (state.workoutTimer.isWorkoutInProgress) {
            ui.showView('workout');
        } else {
            ui.showDailyCheckinModal();
        }
    }
}

function editPlan(planId) {
    ui.showModal('Coming Soon!', 'The plan editor is under development and will be available in a future update.');
}

function swapExercise(exerciseIndex) {
    const activePlan = state.allPlans.find(p => p.id === state.activePlanId);
    const workout = activePlan.weeks[state.currentView.week][state.currentView.day];
    const currentExercise = workout.exercises[exerciseIndex];
    const exerciseData = state.exercises.find(e => e.name === currentExercise.name);

    if (!exerciseData || !exerciseData.alternatives || exerciseData.alternatives.length === 0) {
        ui.showModal("No Alternatives", "Sorry, no alternatives are listed for this exercise.");
        return;
    }

    const cardContainer = document.createElement('div');
    cardContainer.className = 'card-group vertical';

    exerciseData.alternatives.forEach(altName => {
        const card = document.createElement('div');
        card.className = 'goal-card alternative-card';
        card.dataset.action = 'selectAlternative';
        card.dataset.newExerciseName = altName;
        card.dataset.exerciseIndex = exerciseIndex;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');

        const title = document.createElement('h3');
        title.textContent = altName;

        const performanceText = document.createElement('p');
        const lastPerformance = findLastPerformance(`ex_${altName.replace(/\s+/g, '_')}`);
        if (lastPerformance) {
            performanceText.textContent = `Last time: ${lastPerformance.weight} ${state.settings.units} x ${lastPerformance.reps}`;
        } else {
            performanceText.textContent = 'No recent history.';
        }

        card.appendChild(title);
        card.appendChild(performanceText);
        cardContainer.appendChild(card);
    });

    ui.showModal(`Swap ${currentExercise.name}`, cardContainer, []);
}

function selectAlternative(newExerciseName, exerciseIndex) {
    triggerHapticFeedback('success');
    const activePlan = state.allPlans.find(p => p.id === state.activePlanId);
    const workout = activePlan.weeks[state.currentView.week][state.currentView.day];
    const currentExercise = workout.exercises[exerciseIndex];
    const newExerciseData = state.exercises.find(e => e.name === newExerciseName);
    
    if (newExerciseData) {
        workout.exercises[exerciseIndex] = { 
            ...currentExercise, 
            name: newExerciseData.name, 
            muscle: newExerciseData.muscle, 
            exerciseId: `ex_${newExerciseData.name.replace(/\s+/g, '_')}`, 
            sets: [],
            stallCount: 0,
            note: `Swapped from ${currentExercise.name}.`
        };
        ui.renderDailyWorkout();
        ui.closeModal();
    }
}

// --- EVENT LISTENER INITIALIZATION ---

export function initEventListeners() {
    document.body.addEventListener('click', e => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        
        target.classList.add('pop-animation');
        target.addEventListener('animationend', () => target.classList.remove('pop-animation'), { once: true });

        const { action, ...dataset } = target.dataset;

        const actions = {
            nextOnboardingStep,
            previousOnboardingStep,
            selectOnboardingCard: () => selectOnboardingCard(target, dataset.field, dataset.value),
            showView: () => {
                if (state.currentViewName === 'workout' && dataset.viewName !== 'workout') {
                    stopStopwatch();
                    stopRestTimer();
                }

                if (dataset.viewName === 'workout' && state.workoutTimer.isWorkoutInProgress) {
                    ui.showView('workout');
                } else if (dataset.viewName === 'workout') {
                    const workoutFound = findAndSetNextWorkout();
                    if (workoutFound) ui.showDailyCheckinModal();
                } else {
                    ui.showView(dataset.viewName);
                }
            },
            selectCard: () => selectCard(target, dataset.field, dataset.value, dataset.shouldSave === 'true'),
            setTheme: () => setTheme(dataset.theme),
            setUnits: () => setUnits(dataset.unit),
            setProgressionModel: () => setProgressionModel(dataset.progression),
            setWeightIncrement: () => setWeightIncrement(parseFloat(dataset.increment)),
            setRestDuration: () => setRestDuration(parseInt(dataset.duration)),
            setChartType: () => setChartType(dataset.chartType),
            confirmDeletePlan: () => confirmDeletePlan(dataset.planId),
            setActivePlan: () => setActivePlan(dataset.planId),
            startPlanWorkout: () => startPlanWorkout(dataset.planId),
            editPlan: () => editPlan(dataset.planId),
            confirmCompleteWorkout,
            closeModal: ui.closeModal,
            startRestTimer,
            stopRestTimer,
            submitCheckin,
            addSet: () => {
                triggerHapticFeedback('light');
                const { exerciseIndex } = dataset;
                const activePlan = state.allPlans.find(p => p.id === state.activePlanId);
                const workout = activePlan.weeks[state.currentView.week][state.currentView.day];
                const exercise = workout.exercises[exerciseIndex];
                if (!exercise.sets) exercise.sets = [];
                const setIndex = exercise.sets.length;
                const lastWeight = setIndex > 0 ? exercise.sets[setIndex - 1].weight : (exercise.targetLoad || '');
                exercise.sets.push({ weight: lastWeight, reps: '', rir: '', rawInput: '' });
                ui.renderDailyWorkout();
            },
            swapExercise: () => swapExercise(dataset.exerciseIndex),
            selectAlternative: () => selectAlternative(dataset.newExerciseName, dataset.exerciseIndex),
            openExerciseNotes: () => openExerciseNotes(dataset.exerciseIndex),
            showHistory: () => showHistory(dataset.exerciseId),
            connectGoogleAccount: () => googleSheets.connectToUserAccount()
        };

        if (actions[action]) {
            actions[action]();
        }
    });

    ui.elements.templatePortalView?.addEventListener('click', e => {
        const hubOption = e.target.closest('.hub-option');
        if (!hubOption) return;
        const hubAction = hubOption.dataset.hubAction;
        triggerHapticFeedback('medium');

        if (hubAction === 'new') {
            ui.showModal("Create New Plan?", 
            "This will generate a new intelligent plan based on your current settings. Are you sure?",
            [
                { text: 'Cancel', class: 'secondary-button' },
                { text: 'Yes, Create', class: 'cta-button', action: async () => {
                    triggerHapticFeedback('success');
                    const newMeso = workoutEngine.generateNewMesocycle(state.userSelections, state.exercises, 4);
                    const newPlan = {
                        id: `meso_${Date.now()}`,
                        name: `Intelligent Plan - ${new Date().toLocaleDateString()}`,
                        startDate: new Date().toISOString(),
                        durationWeeks: 4,
                        ...newMeso
                    };
                    state.allPlans.push(newPlan);
                    state.activePlanId = newPlan.id;
                    await googleSheets.saveFullState();
                    ui.closeModal();
                    ui.showView('settings');
                }}
            ]);
        }
        if (hubAction === 'manage') ui.showView('settings');
        if (hubAction === 'premade' || hubAction === 'custom') ui.showModal('Coming Soon!', 'This feature is currently under development.');
    });

    // Debounced input event listener for real-time saving of workout progress.
    let saveTimeout;
    const saveDelay = 1000; // 1 second debounce
    document.body.addEventListener('input', e => {
        if (e.target.matches('.weight-input, .rep-rir-input')) {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                googleSheets.updateState('allPlans', state.allPlans);
            }, saveDelay);
        }
    });

    ui.elements.modal?.addEventListener('click', (e) => {
        if (e.target.id === 'modal' || e.target.id === 'feedback-modal' || e.target.id === 'daily-checkin-modal') {
            ui.closeModal();
            ui.closeFeedbackModal();
            ui.closeDailyCheckinModal();
        }
    });

    ui.elements.workoutView?.addEventListener('input', (e) => {
        if (e.target.matches('.weight-input, .rep-rir-input')) {
            e.target.classList.remove('valid', 'invalid');
            if (e.target.value.trim() !== '') {
                const isValid = e.target.checkValidity();
                e.target.classList.add(isValid ? 'valid' : 'invalid');
            }
            
            const { exerciseIndex, setIndex } = e.target.dataset;
            const activePlan = state.allPlans.find(p => p.id === state.activePlanId);
            const workout = activePlan?.weeks[state.currentView.week][state.currentView.day];
            if (!workout) return;
            
            const exercise = workout.exercises[exerciseIndex];
            if (!exercise || !exercise.sets[setIndex]) return;
            const set = exercise.sets[setIndex];

            if (e.target.classList.contains('weight-input')) {
                set.weight = parseFloat(e.target.value) || '';
            } else if (e.target.classList.contains('rep-rir-input')) {
                const value = e.target.value.toLowerCase();
                set.rawInput = value;
                const repMatch = value.match(/^(\d+)/);
                const rirMatch = value.match(/r(\d+)/) || value.match(/(\d+)\s*rir/);
                
                set.reps = repMatch ? parseInt(repMatch[1]) : '';
                set.rir = rirMatch ? parseInt(rirMatch[1]) : '';

                if (set.weight && set.reps) {
                    if(!state.restTimer.isRunning) startRestTimer();
                    
                    const recommendation = workoutEngine.generateIntraWorkoutRecommendation(set, exercise);
                    ui.displayIntraWorkoutRecommendation(parseInt(exerciseIndex), parseInt(setIndex), recommendation);

                    const isFinalSet = parseInt(setIndex) === exercise.targetSets - 1;
                    if (isFinalSet) {
                        setTimeout(() => triggerFeedbackModals(exercise, parseInt(exerciseIndex), workout), 500);
                    }
                }
            }
        }
    });

    ui.elements.workoutView?.addEventListener('focusin', (e) => {
        if (e.target.matches('.weight-input, .rep-rir-input')) {
            e.target.closest('.set-row').classList.add('active-set');
        }
    });

    ui.elements.workoutView?.addEventListener('focusout', (e) => {
        if (e.target.matches('.weight-input, .rep-rir-input')) {
            e.target.closest('.set-row').classList.remove('active-set');
        }
    });

    ui.elements.exerciseTrackerSelect?.addEventListener('change', (e) => {
        const exerciseName = e.target.value;
        if (exerciseName) {
            ui.renderProgressChart(exerciseName);
            ui.renderE1RMChart(exerciseName);
        }
    });

    ui.elements.sleepSlider?.addEventListener('input', (e) => {
        ui.elements.sleepLabel.textContent = `Sleep: ${e.target.value} hours`;
    });

    ui.elements.stressSlider?.addEventListener('input', (e) => {
        ui.elements.stressLabel.textContent = `Stress Level: ${e.target.value}`;
    });

    document.body.addEventListener('mouseover', e => {
        const target = e.target.closest('[data-tooltip]');
        if (target) ui.showTooltip(target);
    });

    document.body.addEventListener('mouseout', e => {
        const target = e.target.closest('[data-tooltip]');
        if (target) ui.hideTooltip();
    });

    document.getElementById('export-data-btn')?.addEventListener('click', () => {
        triggerHapticFeedback('light');
        exportData();
    });

    document.getElementById('reset-app-btn')?.addEventListener('click', () => {
        triggerHapticFeedback('heavy');
        confirmResetApp();
    });
}
