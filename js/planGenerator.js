import { state } from './state.js';

/**
 * @file planGenerator.js - The "Workout Engine"
 * This file contains the core business logic for the Progression app. It's responsible for:
 * 1.  Dynamically generating entire, individualized mesocycles based on user profile.
 * 2.  Calculating week-to-week progression based on user performance and feedback (auto-regulation).
 * 3.  Generating real-time, intra-workout recommendations for the next set.
 * 4.  Implementing training principles like Volume Landmarks (MV, MEV, MRV) and RIR-based periodization.
 */

// --- DATA & CONSTANTS ---

const VOLUME_LANDMARKS = {
    novice:       { mv: 4,  mev: 6,  mav: 10, mrv: 12 },
    beginner:     { mv: 6,  mev: 8,  mav: 12, mrv: 15 },
    intermediate: { mv: 8,  mev: 10, mav: 16, mrv: 20 },
    advanced:     { mv: 10, mev: 12, mav: 18, mrv: 22 },
};

const EXERCISE_COUNT_PER_SESSION = {
    Primary: 1,
    Secondary: 2,
};

// --- WORKOUT ENGINE ---

export const workoutEngine = {

    /**
     * NEW: Adjusts the current day's workout based on user-reported recovery metrics.
     * @param {number} sleep - Hours of sleep reported by the user.
     * @param {number} stress - Stress level (1-10) reported by the user.
     * @returns {boolean} True if the workout was adjusted, false otherwise.
     */
    adjustWorkoutForRecovery(sleep, stress) {
        const activePlan = state.allPlans.find(p => p.id === state.activePlanId);
        if (!activePlan) return false;

        const { week, day } = state.currentView;
        const workout = activePlan.weeks[week]?.[day];
        if (!workout) return false;

        const sleepThreshold = 6; // Less than 6 hours is considered low
        const stressThreshold = 7; // 7 or higher is considered high
        let adjustmentMade = false;

        if (sleep < sleepThreshold || stress >= stressThreshold) {
            workout.exercises.forEach(exercise => {
                // Reduce target sets by 1, but not below a minimum of 2 sets.
                if (exercise.targetSets > 2) {
                    exercise.targetSets -= 1;
                    adjustmentMade = true;
                }
            });
        }
        
        if(adjustmentMade) {
            console.log("Workout adjusted for recovery. New sets:", workout.exercises.map(e => e.targetSets));
        }

        return adjustmentMade;
    },

    /**
     * Generates a real-time recommendation for the next set based on the performance of the last set.
     * @param {object} completedSet - The set object that was just completed by the user.
     * @param {object} exercise - The full exercise object from the current workout plan.
     * @returns {string|null} A recommendation string (e.g., "Increase weight to 135 lbs") or null if no recommendation.
     */
    generateIntraWorkoutRecommendation(completedSet, exercise) {
        if (!completedSet.reps || !completedSet.weight || completedSet.rir === null) {
            return "Enter weight, reps, and RIR to get a recommendation.";
        }

        const { weightIncrement } = state.settings;
        const targetRIR = exercise.targetRIR || 3;
        const actualRIR = completedSet.rir;
        const diff = actualRIR - targetRIR;

        if (diff > 1) {
            const newWeight = completedSet.weight + weightIncrement;
            return `You were a bit light. Try increasing to ${newWeight} ${state.settings.units}`;
        }
        
        if (diff < -1) {
            const newWeight = Math.max(0, completedSet.weight - weightIncrement);
            if (newWeight === 0) return `Drop weight significantly to focus on form.`;
            return `That was very hard. Try decreasing to ${newWeight} ${state.settings.units}`;
        }

        if (Math.abs(diff) <= 1) {
            return `Perfect! Stay at ${completedSet.weight} ${state.settings.units} for the next set.`;
        }

        return "No recommendation at this time.";
    },

    generateNewMesocycle(userSelections, allExercises, durationWeeks) {
        const { trainingAge, goal, daysPerWeek } = userSelections;
        const split = this._getSplitForDays(daysPerWeek);
        const landmarks = VOLUME_LANDMARKS[trainingAge] || VOLUME_LANDMARKS.beginner;
        const weeklyVolumeTargets = this._calculateInitialWeeklyVolume(split.muscles, landmarks.mev);
        const weeklyTemplate = this._buildWeekTemplate(split, weeklyVolumeTargets, allExercises, userSelections.style);
        const mesocycle = this._createFullMesocycle(weeklyTemplate, durationWeeks);
        return mesocycle;
    },

    calculateNextWorkoutProgression(completedWorkout, nextWorkout) {
        const { weightIncrement } = state.settings;
        
        completedWorkout.exercises.forEach((completedEx) => {
            const nextWeekEx = nextWorkout.exercises.find(ex => ex.exerciseId === completedEx.exerciseId);
            if (!nextWeekEx) return;
            
            if (!completedEx.sets || completedEx.sets.length === 0) {
                nextWeekEx.targetLoad = completedEx.targetLoad || null;
                nextWeekEx.targetReps = completedEx.targetReps;
                return;
            }

            // Calculate average RIR for the completed exercise
            const setsWithRIR = completedEx.sets.filter(s => s.rir !== null && s.rir !== '' && s.weight > 0);
            if (setsWithRIR.length === 0) {
                const topSet = completedEx.sets.reduce((max, set) => ((set.weight || 0) > (max.weight || 0) ? set : max), { weight: 0 });
                const allSetsSuccessful = completedEx.sets.every(set => (set.reps || 0) >= completedEx.targetReps);
                nextWeekEx.targetLoad = allSetsSuccessful ? (topSet.weight || 0) + weightIncrement : topSet.weight;
                nextWeekEx.targetReps = completedEx.targetReps;
                return;
            }

            const averageRIR = setsWithRIR.reduce((sum, s) => sum + s.rir, 0) / setsWithRIR.length;
            const targetRIR = completedEx.targetRIR || 3;

            const topSet = completedEx.sets.reduce((max, set) => ((set.weight || 0) > (max.weight || 0) ? set : max), { weight: 0 });

            // RIR-based progression logic
            if (averageRIR > targetRIR + 1) {
                // Too easy, increase weight
                nextWeekEx.targetLoad = topSet.weight + weightIncrement;
                nextWeekEx.stallCount = 0;
                console.log(`Progression: Increasing weight for ${nextWeekEx.name} due to low RIR.`);
            } else if (averageRIR < targetRIR - 1) {
                // Too hard, keep weight the same and check for stall
                nextWeekEx.targetLoad = topSet.weight;
                nextWeekEx.stallCount = (nextWeekEx.stallCount || 0) + 1;
                if (nextWeekEx.stallCount >= 2) {
                    console.log(`Stall detected for ${nextWeekEx.name}. Suggesting deload or alternative.`);
                }
                console.log(`Progression: Maintaining weight for ${nextWeekEx.name} due to high RIR.`);
            } else {
                // Just right, increase reps or weight slightly
                if (nextWeekEx.targetReps < 12) { // Cap reps to avoid endless progression
                    nextWeekEx.targetReps = (nextWeekEx.targetReps || 8) + 1;
                    nextWeekEx.targetLoad = topSet.weight;
                    console.log(`Progression: Increasing reps for ${nextWeekEx.name} due to optimal RIR.`);
                } else {
                    nextWeekEx.targetLoad = topSet.weight + weightIncrement;
                    nextWeekEx.targetReps = 8;
                    console.log(`Progression: Resetting reps and increasing weight for ${nextWeekEx.name}.`);
                }
                nextWeekEx.stallCount = 0;
            }
        });
    },

    // --- PRIVATE HELPER FUNCTIONS ---

    _getSplitForDays(days) {
        if (days <= 3) {
            return { 
                name: 'Full Body', 
                days: {
                    'Full Body A': ['quads', 'chest', 'back', 'shoulders'],
                    'Full Body B': ['hamstrings', 'back', 'chest', 'biceps', 'triceps'],
                    'Full Body C': ['quads', 'shoulders', 'back', 'core']
                },
                muscles: ['chest', 'back', 'quads', 'hamstrings', 'shoulders', 'biceps', 'triceps', 'core']
            };
        } else if (days === 4) {
            return { 
                name: 'Upper/Lower', 
                days: {
                    'Upper A': ['chest', 'back', 'shoulders', 'biceps', 'triceps'],
                    'Lower A': ['quads', 'hamstrings', 'core'],
                    'Upper B': ['back', 'chest', 'shoulders', 'triceps', 'biceps'],
                    'Lower B': ['hamstrings', 'quads', 'core']
                },
                muscles: ['chest', 'back', 'quads', 'hamstrings', 'shoulders', 'biceps', 'triceps', 'core']
            };
        } else {
            return { 
                name: 'Push/Pull/Legs', 
                days: {
                    'Push': ['chest', 'shoulders', 'triceps'],
                    'Pull': ['back', 'biceps'],
                    'Legs': ['quads', 'hamstrings', 'core'],
                },
                muscles: ['chest', 'back', 'quads', 'hamstrings', 'shoulders', 'biceps', 'triceps', 'core']
            };
        }
    },

    _calculateInitialWeeklyVolume(musclesInSplit, targetVolume) {
        const weeklyVolume = {};
        musclesInSplit.forEach(muscle => {
            weeklyVolume[muscle] = targetVolume;
        });
        if (weeklyVolume.biceps) weeklyVolume.biceps = Math.round(targetVolume * 0.75);
        if (weeklyVolume.triceps) weeklyVolume.triceps = Math.round(targetVolume * 0.75);
        if (weeklyVolume.core) weeklyVolume.core = Math.round(targetVolume * 0.75);
        return weeklyVolume;
    },

    _buildWeekTemplate(split, weeklyVolumeTargets, allExercises, equipmentStyle) {
        const weekTemplate = [];
        const equipmentFilter = this._getEquipmentFilter(equipmentStyle);
        let remainingVolume = { ...weeklyVolumeTargets };

        for (const dayLabel in split.days) {
            const dayMuscles = split.days[dayLabel];
            const dayObject = { name: dayLabel, exercises: [] };
            
            dayMuscles.forEach(muscle => {
                if (remainingVolume[muscle] > 0) {
                    const exercises = this._selectExercisesForMuscleGroup(allExercises, muscle, equipmentFilter, 'Primary', 1);
                    if (exercises.length > 0) {
                        dayObject.exercises.push(...exercises);
                        remainingVolume[muscle] -= 3;
                    }
                }
            });
            
            dayMuscles.forEach(muscle => {
                while (remainingVolume[muscle] > 0) {
                     const exercises = this._selectExercisesForMuscleGroup(allExercises, muscle, equipmentFilter, 'Secondary', 1);
                     if (exercises.length > 0) {
                        dayObject.exercises.push(...exercises);
                        remainingVolume[muscle] -= 3;
                    } else {
                        break;
                    }
                }
            });

            weekTemplate.push(dayObject);
        }
        return weekTemplate;
    },

    _selectExercisesForMuscleGroup(allExercises, muscle, equipmentFilter, type, count) {
        const exercisePool = allExercises.filter(ex =>
            ex.muscle.toLowerCase() === muscle.toLowerCase() &&
            (ex.type === type) &&
            (ex.equipment.includes('bodyweight') || ex.equipment.some(e => equipmentFilter.includes(e)))
        );

        const selected = exercisePool.sort(() => 0.5 - Math.random()).slice(0, count);

        return selected.map(ex => ({
            exerciseId: `ex_${ex.name.replace(/\s+/g, '_')}`,
            name: ex.name,
            muscle: ex.muscle,
            type: ex.type,
            targetSets: 3,
            targetReps: 8,
            targetRIR: 3,
            targetLoad: null,
            sets: [],
            stallCount: 0,
            note: ''
        }));
    },
    
    _findAlternativeExercise(exerciseId, allExercises) {
        const originalExerciseName = exerciseId.replace('ex_', '').replace(/_/g, ' ');
        const originalExercise = allExercises.find(ex => ex.name === originalExerciseName);
        if (!originalExercise || !originalExercise.alternatives || originalExercise.alternatives.length === 0) {
            return null;
        }
        const alternativeName = originalExercise.alternatives[0];
        return allExercises.find(ex => ex.name === alternativeName) || null;
    },

    _createFullMesocycle(weekTemplate, durationWeeks) {
        const mesocycle = { weeks: {} };

        for (let i = 1; i <= durationWeeks; i++) {
            mesocycle.weeks[i] = {};
            const isDeload = (i === durationWeeks);
            const targetRIR = this._getRirForWeek(i, durationWeeks);

            weekTemplate.forEach((dayTemplate, dayIndex) => {
                const dayKey = dayIndex + 1;
                const newDay = JSON.parse(JSON.stringify(dayTemplate));
                newDay.completed = false;
                
                newDay.exercises.forEach(ex => {
                    ex.targetRIR = targetRIR;
                    if (isDeload) {
                        ex.targetSets = Math.ceil(ex.targetSets / 2);
                    }
                });
                mesocycle.weeks[i][dayKey] = newDay;
            });
        }
        return mesocycle;
    },

    _getRirForWeek(week, totalWeeks) {
        if (week === totalWeeks) return 4;
        const progress = (week - 1) / (totalWeeks - 1);
        if (progress < 0.25) return 3;
        if (progress < 0.5) return 2;
        if (progress < 0.75) return 1;
        return 0; // Final week before deload, push hard
    },

    _getEquipmentFilter(style) {
        if (style === 'gym') return ['barbell', 'dumbbell', 'machine', 'cable', 'rack', 'bench', 'bodyweight', 'pullup-bar'];
        if (style === 'home') return ['bodyweight', 'dumbbell', 'pullup-bar'];
        return ['barbell', 'dumbbell', 'machine', 'cable', 'rack', 'bench', 'bodyweight', 'pullup-bar'];
    },
};
