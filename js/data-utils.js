// js/data-utils.js
import { rawData } from './data.js';

// --- CONFIGURATION DU BOOKMAKER ---
const BOOKMAKER_MARGIN = 1.15; // Marge de 15% 
const MIN_COTE = 1.05;         // Cote minimale
const MAX_COTE = 25.00;        // Plafond (divisé par 10 pour réalisme)

/**
 * Calcule les statistiques d'un joueur en ignorant les 'null'
 */
function calculateStats(scores) {
    // 1. On filtre pour ne garder que les vrais nombres
    const validScores = scores.filter(score => typeof score === 'number' && score !== null);
    
    // Si le joueur n'a jamais joué (que des null), on lui donne des stats "fantômes" très faibles
    if (validScores.length === 0) {
        return { average: 10, stdDev: 50, gamesPlayed: 0 }; // Moyenne très basse = Cote énorme pour le Top 1
    }
    
    const gamesPlayed = validScores.length;
    const sum = validScores.reduce((acc, score) => acc + score, 0);
    const average = sum / gamesPlayed;
    
    // Calcul de l'écart-type (Volatilité)
    // Si un joueur n'a joué qu'une fois, stdDev est 0, on met une valeur par défaut pour éviter les bugs
    let variance = validScores.reduce((acc, score) => acc + Math.pow(score - average, 2), 0) / gamesPlayed;
    let stdDev = Math.sqrt(variance);
    
    if (stdDev === 0 || gamesPlayed === 1) stdDev = average * 0.2; // Estimation de volatilité si pas assez de données

    return { average, stdDev, gamesPlayed };
}

/**
 * Fonction Mathématique de Gauss (Loi Normale)
 */
function gaussianProbability(x, mean, stdDev) {
    const exponent = -0.5 * Math.pow((x - mean) / stdDev, 2);
    return Math.exp(exponent) / (stdDev * Math.sqrt(2 * Math.PI));
}

/**
 * Récupère tous les joueurs avec leurs stats calculées
 */
export function getAllPlayersWithStats() {
    return rawData.map(player => {
        const stats = calculateStats(player.scores);
        return {
            name: player.name,
            ...stats
        };
    }).sort((a, b) => b.average - a.average); // Trie du meilleur au moins bon score moyen
}

/**
 * CALCULE LA COTE EN TEMPS RÉEL
 * @param {Object} playerStats - Les stats du joueur
 * @param {Number} targetRank - Le rang visé (1, 2, 3...)
 * @param {Number} totalPlayers - Nombre de joueurs dans le match
 */
export function calculateRealTimeOdds(playerStats, targetRank, totalPlayers = 8) {
    // --- 1. ÉTALONNAGE ---
    // Tes scores vont de ~20 à ~90. Il faut adapter l'échelle.
    const MAX_SCORE_POSSIBLE = 100; // Angelos a fait 91, donc 100 est un bon max
    const MIN_SCORE_POSSIBLE = 15;  // Nevroz a fait 17
    
    // Score normalisé (0 à 1) : Où se situe le joueur par rapport au niveau global ?
    let skillLevel = (playerStats.average - MIN_SCORE_POSSIBLE) / (MAX_SCORE_POSSIBLE - MIN_SCORE_POSSIBLE);
    skillLevel = Math.max(0.1, Math.min(0.99, skillLevel)); // On borne entre 0.1 et 0.99
    
    // --- 2. RANG ESPÉRÉ ---
    // Un skillLevel de 1.0 vise le rang 1. Un skillLevel de 0.0 vise le dernier rang.
    const expectedRank = 1 + (1 - skillLevel) * (totalPlayers - 1);
    
    // --- 3. INCERTITUDE ---
    // Plus l'écart-type est grand, plus le résultat est incertain (cotes plus plates)
    // On ajoute une incertitude naturelle car tout peut arriver
    const sigma = Math.max(1.5, (playerStats.stdDev / 10) + 1);

    // --- 4. PROBABILITÉ ---
    let probability = gaussianProbability(targetRank, expectedRank, sigma);
    
    // Ajustement artificiel pour les événements très rares (éviter les cotes > 1000)
    // Si la proba est minuscule, on la remonte un tout petit peu
    if (probability < 0.005) probability = 0.005;

    // --- 5. CONVERSION EN COTE ---
    let rawCote = ((1 / probability) * BOOKMAKER_MARGIN) / 10; // Divisé par 10 pour réalisme
    // Bonus Cote pour le rang 1 (c'est dur d'être 1er)
    if (targetRank === 1) rawCote *= 1.2;

    // --- 6. LIMITES ET ARRONDI ---
    let finalCote = Math.min(Math.max(rawCote, MIN_COTE), MAX_COTE);
    
    return parseFloat(finalCote.toFixed(2));
}