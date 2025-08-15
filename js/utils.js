import { state } from './state.js';

/**
 * @file utils.js contains small, reusable helper functions used throughout the application.
 */

/**
 * Sanitizes a string by removing HTML tags to prevent XSS attacks.
 * @param {string} str - The input string from a user.
 * @returns {string} The sanitized string.
 */
export function sanitizeInput(str) {
    if (typeof str !== 'string') return '';
    // This regex finds anything that looks like an HTML tag and removes it.
    return str.replace(/<[^>]*>?/gm, '');
}


/**
 * Capitalizes the first letter of a string.
 * @param {string} str - The string to capitalize.
 * @returns {string} The capitalized string.
 */
export function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

/**
 * Finds the last recorded performance for a given exercise.
 * This is now correctly located in utils.js to break a circular dependency.
 * @param {string} exerciseId - The ID of the exercise to look up.
 * @returns {object|null} The top set from the last performance, or null if none is found.
 */
export function findLastPerformance(exerciseId) {
    for (const historyItem of state.workoutHistory) {
        const exerciseInstance = historyItem.exercises?.find(ex => ex.exerciseId === exerciseId);
        if (exerciseInstance && exerciseInstance.sets && exerciseInstance.sets.length > 0) {
            const topSet = exerciseInstance.sets.reduce((max, set) => ((set.weight || 0) > (max.weight || 0) ? set : max), { weight: 0 });
            if (topSet.weight > 0) {
                return topSet;
            }
        }
    }
    return null;
}


/**
 * Creates the HTML for a single set row in the daily workout view.
 * @param {number} exIndex - The index of the exercise.
 * @param {number} setIndex - The index of the set.
 * @param {object} set - The set data object, containing weight, rawInput, and note.
 * @param {object} lastWeekSet - The data for the corresponding set from the previous week.
 * @param {number} targetReps - The target number of reps for the set.
 * @param {number} targetRIR - The target Reps in Reserve for the set.
 * @param {number} week - The current week number.
 * @returns {string} The HTML string for the set row.
 */
export function createSetRowHTML(exIndex, setIndex, set, lastWeekSet, targetReps, targetRIR, week) {
    let placeholder;
    if (week === 1) {
        placeholder = `e.g. ${targetReps} reps @ ${targetRIR} RIR`;
    } else {
        const lastWeekPerformance = lastWeekSet ? `${lastWeekSet.weight}x${lastWeekSet.reps}` : `e.g. ${targetReps} reps`;
        placeholder = lastWeekPerformance;
    }
    
    // Added the 'slide-in-bottom' class for a subtle animation on render.
    return `
        <div class="set-row slide-in-bottom" data-set-index="${setIndex}" style="animation-delay: ${setIndex * 0.05}s;">
            <div class="set-number">${setIndex + 1}</div>
            <div class="set-inputs-wrapper">
                <div class="set-inputs">
                    <input type="text" inputmode="decimal" class="weight-input" placeholder="${lastWeekSet?.weight || '-'}" value="${set.weight || ''}" data-exercise-index="${exIndex}" data-set-index="${setIndex}">
                    <input type="text" inputmode="tel" class="rep-rir-input" placeholder="${placeholder}" value="${set.rawInput || ''}" data-exercise-index="${exIndex}" data-set-index="${setIndex}">
                </div>
                <div class="recommendation-text" data-exercise-index="${exIndex}" data-set-index="${setIndex}"></div>
            </div>
            <div class="set-actions">
            </div>
        </div>
    `;
}
