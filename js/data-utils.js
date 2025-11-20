// js/data-utils.js

import { rawData } from './data.js';

// Fonction pour calculer la moyenne et l'écart-type des scores non nuls
function calculateStats(scores) {
    const validScores = scores.filter(score => score !== null);
    if (validScores.length === 0) {
        return { average: 0, stdDev: 0, gamesPlayed: 0 };
    }
    
    const gamesPlayed = validScores.length;
    const sum = validScores.reduce((acc, score) => acc + score, 0);
    const average = sum / gamesPlayed;
    
    // Calcul de l'écart-type (Standard Deviation)
    const variance = validScores.reduce((acc, score) => acc + Math.pow(score - average, 2), 0) / gamesPlayed;
    const stdDev = Math.sqrt(variance);

    return { average, stdDev, gamesPlayed };
}

// Fonction pour obtenir la liste complète des joueurs avec leurs stats
export function getAllPlayersWithStats() {
    return rawData.map(player => {
        const stats = calculateStats(player.scores);
        return {
            name: player.name,
            ...stats,
            // Score moyen divisé par l'écart-type (un indicateur de régularité/performance)
            performanceIndex: stats.average > 0 ? stats.average / (stats.stdDev || 1) : 0 
        };
    }).sort((a, b) => b.performanceIndex - a.performanceIndex); // Trie par meilleur index
}

// Fonction de calcul de cote dynamique (très simplifiée et basée sur la performance)
// Plus la performance est élevée, plus la cote pour le Top 1 est basse, et inversement pour un Top 10.
export function calculateDynamicCote(playerStats, desiredRank) {
    const minCote = 1.05;
    const maxCote = 25.0; // Cote très haute pour les paris improbables

    // Base de la cote : inversement proportionnelle à la performanceIndex
    let cote = Math.exp(-playerStats.performanceIndex / 10) * 10; // Utilisation d'une fonction exponentielle pour accentuer les écarts

    // Ajustement en fonction du rang désiré (1er rang = cote plus basse)
    // On veut une cote basse pour le rang probable (Angelos 1er) et haute pour l'improbable (Angelos 8e)

    if (desiredRank <= 3) {
        // Rang Top 3 : Favoriser les joueurs avec un haut 'average'
        cote = cote * (1 + (desiredRank - 1) / 5) * (1 / playerStats.average * 100);
        
    } else if (desiredRank > 7) {
        // Rang Top 8-10 (Improbable pour les bons joueurs)
        // La cote augmente fortement
        cote = cote * 2.5 * (desiredRank - 6) * playerStats.performanceIndex;
    } else {
        // Rang Milieu (4-7)
        cote = cote * 1.5;
    }

    // Limiter la cote
    cote = Math.min(Math.max(cote, minCote), maxCote);
    
    // Arrondir à 2 décimales
    return parseFloat(cote.toFixed(2));
}