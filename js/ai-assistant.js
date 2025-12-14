import { rawData } from './data.js';
import { getAllPlayersWithStats, calculateRealTimeOdds } from './data-utils.js';

// === 1. ANALYSE DE TENDANCE (HOT/COLD) ===
export function analyzeTrends() {
    const players = getAllPlayersWithStats();
    const results = [];
    
    players.forEach(player => {
        // Récupérer les stats brutes
        const rawPlayer = rawData.find(p => p.name === player.name);
        if (!rawPlayer) return;
        
        const scores = rawPlayer.scores.filter(s => s !== null);
        if (scores.length < 5) return; // Pas assez de données
        
        // Prendre les 3 dernières semaines vs 3 précédentes
        const recent = scores.slice(-3);
        const previous = scores.slice(-6, -3);
        
        if (recent.length < 3 || previous.length < 3) return;
        
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const previousAvg = previous.reduce((a, b) => a + b, 0) / previous.length;
        
        const trend = recentAvg - previousAvg;
        const trendPercent = ((trend / previousAvg) * 100).toFixed(1);
        
        results.push({
            name: player.name,
            trend: trend,
            trendPercent: trendPercent,
            recentAvg: recentAvg.toFixed(1),
            previousAvg: previousAvg.toFixed(1),
            status: trend > 5 ? 'hot' : trend < -5 ? 'cold' : 'stable'
        });
    });
    
    return results.sort((a, b) => b.trend - a.trend);
}

// === 2. DÉTECTION DE JOUEURS SOUS-ESTIMÉS ===
export function findUndervaluedPlayers(matchPlayers = null, totalPlayers = 8) {
    const allStats = getAllPlayersWithStats();
    const undervalued = [];
    
    // Filtrer si on a une liste de joueurs spécifique
    const playersToAnalyze = matchPlayers 
        ? allStats.filter(p => matchPlayers.includes(p.name))
        : allStats;
    
    playersToAnalyze.forEach(player => {
        if (player.gamesPlayed < 5) return; // Pas assez de données
        
        // Calculer la cote pour le rang 3 (Top 3)
        const oddTop3 = calculateRealTimeOdds(player, 3, totalPlayers);
        
        // Critères de valeur :
        // 1. Moyenne correcte (> 45)
        // 2. Faible volatilité (stdDev < 15)
        // 3. Cote intéressante (> 2.5)
        if (player.average >= 45 && player.stdDev < 15 && oddTop3 > 2.5) {
            undervalued.push({
                name: player.name,
                average: player.average.toFixed(1),
                stability: (100 - (player.stdDev / player.average * 100)).toFixed(0),
                oddTop3: oddTop3.toFixed(2),
                confidence: calculateConfidence(player)
            });
        }
    });
    
    return undervalued.sort((a, b) => b.confidence - a.confidence);
}

// === 3. CALCUL DE CONFIANCE (0-100) ===
function calculateConfidence(player) {
    let confidence = 0;
    
    // Facteur 1 : Nombre de matchs (max 30 points)
    confidence += Math.min(player.gamesPlayed * 2, 30);
    
    // Facteur 2 : Performance (max 40 points)
    const perfScore = (player.average - 20) / 70 * 40; // Échelle 20-90 → 0-40
    confidence += Math.max(0, perfScore);
    
    // Facteur 3 : Stabilité (max 30 points)
    const stabilityScore = Math.max(0, (30 - player.stdDev));
    confidence += Math.min(stabilityScore, 30);
    
    return Math.min(100, confidence).toFixed(0);
}

// === 4. ANALYSE H2H (Head to Head) ===
export function analyzeHeadToHead(player1, player2) {
    const p1Stats = getAllPlayersWithStats().find(p => p.name === player1);
    const p2Stats = getAllPlayersWithStats().find(p => p.name === player2);
    
    if (!p1Stats || !p2Stats) return null;
    
    // Récupérer les matchs où les 2 ont joué
    const p1Raw = rawData.find(p => p.name === player1);
    const p2Raw = rawData.find(p => p.name === player2);
    
    let p1Wins = 0, p2Wins = 0, draws = 0;
    
    for (let i = 0; i < p1Raw.scores.length; i++) {
        const s1 = p1Raw.scores[i];
        const s2 = p2Raw.scores[i];
        
        if (s1 !== null && s2 !== null) {
            if (s1 > s2) p1Wins++;
            else if (s2 > s1) p2Wins++;
            else draws++;
        }
    }
    
    const totalMatches = p1Wins + p2Wins + draws;
    
    if (totalMatches === 0) {
        return {
            player1, player2,
            message: "Aucun affrontement direct",
            favorite: null
        };
    }
    
    return {
        player1,
        player2,
        p1Wins,
        p2Wins,
        draws,
        totalMatches,
        favorite: p1Wins > p2Wins ? player1 : p2Wins > p1Wins ? player2 : "égalité",
        winRate1: ((p1Wins / totalMatches) * 100).toFixed(0),
        winRate2: ((p2Wins / totalMatches) * 100).toFixed(0)
    };
}

// === 5. PRÉDICTION MATCH (Machine Learning Simplifié) ===
export function predictMatchOutcome(playersList) {
    const players = playersList.map(name => {
        const stats = getAllPlayersWithStats().find(p => p.name === name);
        return { name, ...stats };
    }).filter(p => p.name); // Supprimer les null
    
    // Pondération des critères
    const predictions = players.map(player => {
        const avgScore = player.average || 0;
        const consistency = 100 - (player.stdDev / player.average * 100);
        const experience = Math.min(player.gamesPlayed * 5, 50); // Max 50 points
        
        // Score total pondéré
        const totalScore = (avgScore * 0.5) + (consistency * 0.3) + (experience * 0.2);
        
        return {
            name: player.name,
            predictedScore: totalScore.toFixed(1),
            probability: 0 // Calculé après
        };
    });
    
    // Calcul des probabilités relatives
    const totalPredicted = predictions.reduce((sum, p) => sum + parseFloat(p.predictedScore), 0);
    predictions.forEach(p => {
        p.probability = ((parseFloat(p.predictedScore) / totalPredicted) * 100).toFixed(1);
    });
    
    return predictions.sort((a, b) => b.predictedScore - a.predictedScore);
}

// === 6. SUGGESTION INTELLIGENTE COMPLÈTE ===
export function generateSmartSuggestions(matchId, matchPlayers, userBets = []) {
    const suggestions = [];
    
    // 1. Analyse des tendances
    const trends = analyzeTrends();
    const hotPlayers = trends.filter(t => t.status === 'hot').slice(0, 3);
    
    if (hotPlayers.length > 0) {
        suggestions.push({
            type: 'hot',
            title: '🔥 EN FORME ACTUELLEMENT',
            players: hotPlayers.map(p => ({
                name: p.name,
                detail: `+${p.trendPercent}% sur 3 dernières semaines`,
                recommendation: `Pariez sur Top 3 (Cote ≈ x${calculateRealTimeOdds(getAllPlayersWithStats().find(pl => pl.name === p.name), 3, matchPlayers.length).toFixed(2)})`
            }))
        });
    }
    
    // 2. Joueurs sous-estimés
    const undervalued = findUndervaluedPlayers(matchPlayers, matchPlayers.length);
    if (undervalued.length > 0) {
        suggestions.push({
            type: 'value',
            title: '💎 VALEURS CACHÉES',
            players: undervalued.slice(0, 2).map(p => ({
                name: p.name,
                detail: `Stabilité: ${p.stability}% | Confiance: ${p.confidence}%`,
                recommendation: `Bon rapport risque/rendement`
            }))
        });
    }
    
    // 3. Prédiction du match
    const prediction = predictMatchOutcome(matchPlayers);
    suggestions.push({
        type: 'prediction',
        title: '🎯 PRÉDICTION IA',
        players: prediction.slice(0, 3).map((p, i) => ({
            name: p.name,
            detail: `Probabilité Top 3: ${p.probability}%`,
            recommendation: `Rang prédit: #${i + 1}`
        }))
    });
    
    // 4. Avertissements personnalisés
    const warnings = [];
    
    // Si l'utilisateur a déjà beaucoup parié
    const totalUserBets = userBets.reduce((sum, b) => sum + b.amount, 0);
    if (totalUserBets > 500) {
        warnings.push("⚠️ Vous avez déjà misé beaucoup. Gérez votre bankroll !");
    }
    
    // Si l'utilisateur perd beaucoup
    const recentLosses = userBets.filter(b => b.isSettled && b.status === 'lost').slice(-5);
    if (recentLosses.length >= 3) {
        warnings.push("⚠️ 3 défaites récentes détectées. Prenez une pause ou réduisez les mises.");
    }
    
    if (warnings.length > 0) {
        suggestions.push({
            type: 'warning',
            title: '🚨 ALERTES',
            players: warnings.map(w => ({ name: '', detail: w, recommendation: '' }))
        });
    }
    
    return suggestions;
}