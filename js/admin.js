// js/admin.js

import { auth, db, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, onAuthStateChanged } from './firebase.js';
import { rawData } from './data.js';
import { getAllPlayersWithStats, calculateDynamicCote } from './data-utils.js';

// ----------------------------------------------------
// ⚠️ VOTRE ID D'ADMINISTRATEUR
// ----------------------------------------------------
const ADMIN_UID = "CZ0UeiyrPNVufTVnnYSH4YTnGP13"; 
// ----------------------------------------------------

const adminPanel = document.getElementById('adminPanel');
const loading = document.getElementById('loading');
const denied = document.getElementById('denied');
const matchList = document.getElementById('matchList');
const btnCreateMatch = document.getElementById('btnCreateMatch');
const selectPlayerContainer = document.getElementById('selectPlayerContainer');

let allPlayers = getAllPlayersWithStats(); 
const MAX_RANKINGS = 10;
const MIN_PLAYERS = 8; // Minimum de joueurs requis
let playerSelects = []; 

// --- 1. CONTRÔLE D'ACCÈS ---
onAuthStateChanged(auth, (user) => {
    loading.style.display = 'none';
    if (user && user.uid === ADMIN_UID) {
        adminPanel.style.display = 'block';
        setupRankingSelects();
        loadMatches();
    } else {
        denied.style.display = 'block';
    }
});

// --- 2. CRÉATION DES SELECTEURS DE CLASSEMENT ---
function setupRankingSelects() {
    let html = '';
    const playerOptions = allPlayers.map(p => `<option value="${p.name}">${p.name}</option>`).join('');

    for (let i = 1; i <= MAX_RANKINGS; i++) {
        const selectId = `rank-${i}`;
        html += `
            <div class="form-group select-player">
                <label>Rang ${i} ${i <= MIN_PLAYERS ? '(Minimum)' : ''}</label>
                <select id="${selectId}" class="input-field">
                    <option value="">-- Choisir un joueur --</option>
                    ${playerOptions}
                </select>
            </div>
        `;
    }
    selectPlayerContainer.innerHTML = html;
    
    playerSelects = []; // Réinitialiser le tableau
    for (let i = 1; i <= MAX_RANKINGS; i++) {
        playerSelects.push(document.getElementById(`rank-${i}`));
    }
}

// --- 3. FONCTION DE CRÉATION DE MATCH (Classement) ---
btnCreateMatch.addEventListener('click', async () => {
    const selectedPlayers = playerSelects.map(s => s.value).filter(name => name !== "");

    if (selectedPlayers.length < MIN_PLAYERS) {
        alert(`Veuillez sélectionner au moins ${MIN_PLAYERS} joueurs pour ce classement.`);
        return;
    }
    
    const uniquePlayers = new Set(selectedPlayers);
    if (uniquePlayers.size !== selectedPlayers.length) {
        alert("Attention: Le même joueur ne peut pas être sélectionné deux fois !");
        return;
    }

    const odds = {};
    const matchPlayers = {};

    selectedPlayers.forEach((playerName) => {
        matchPlayers[playerName] = { name: playerName };
    });

    for (const playerName of selectedPlayers) {
        const playerStats = allPlayers.find(p => p.name === playerName);
        odds[playerName] = {};
        for (let rank = 1; rank <= MAX_RANKINGS; rank++) {
             odds[playerName][rank] = calculateDynamicCote(playerStats, rank);
        }
    }

    try {
        const matchId = `C-${Date.now()}`;
        await setDoc(doc(db, "matches", matchId), {
            type: 'ranking',
            players: matchPlayers, 
            allOdds: odds, 
            status: 'open',
            finalRanking: {}, 
            createdAt: new Date().toISOString()
        });
        alert(`Classement ${matchId} créé avec ${selectedPlayers.length} joueurs et ouvert aux paris !`);
        loadMatches();
    } catch (e) {
        console.error("Erreur création de match:", e);
        alert("Erreur lors de la création du classement.");
    }
});

// --- 4. CHARGEMENT ET AFFICHAGE DES MATCHS (Classements) ---
async function loadMatches() {
    matchList.innerHTML = '<p style="color: #888; text-align: center;">Chargement...</p>';
    const q = query(collection(db, "matches"));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
        matchList.innerHTML = '<p style="color: #888; text-align: center;">Aucun classement trouvé.</p>';
        return;
    }

    matchList.innerHTML = '';
    querySnapshot.forEach((doc) => {
        const match = doc.data();
        const matchId = doc.id;
        
        let statusClass, statusText, actionButton = '';
        const numPlayers = Object.keys(match.players).length;

        if (match.status === 'open') {
            statusClass = 'status-open';
            statusText = 'OUVERT';
            actionButton = `<button class="btn btn-action" onclick="closeBets('${matchId}')">Fermer les paris</button>`;
        } else if (match.status === 'closed') {
            statusClass = 'status-closed';
            statusText = 'CLOS (À PAYER)';
            actionButton = `<button class="btn btn-action" style="background-color: green;" onclick="openSettleModal('${matchId}')">Entrer le Classement Final</button>`;
        } else { 
            statusClass = 'status-settled';
            statusText = `PAYÉ`;
        }

        matchList.innerHTML += `
            <div class="match-card">
                <div class="match-info">
                    <strong>Classement Top ${numPlayers}</strong>
                    <br><small style="color: #aaa;">Participants: ${numPlayers} joueurs | ID: ${matchId}</small>
                </div>
                <div>
                    <span class="match-status ${statusClass}">${statusText}</span>
                    ${actionButton}
                </div>
            </div>
        `;
    });
}

// --- 5. DISTRIBUTION DES GAINS (Nouvelle version avec modale) ---

let currentSettleMatchId = null;

window.openSettleModal = async (matchId) => {
    currentSettleMatchId = matchId;
    document.getElementById('modalError').style.display = 'none';

    try {
        const matchDoc = await getDoc(doc(db, "matches", matchId));
        const matchData = matchDoc.data();
        const players = Object.keys(matchData.players);
        const numPlayers = players.length;

        document.getElementById('modalInfo').innerText = `Veuillez attribuer un rang unique à chaque joueur sélectionné (Top ${numPlayers}).`;

        const tableBody = document.getElementById('resultsTableBody');
        tableBody.innerHTML = ''; // Nettoyer l'ancien contenu

        players.forEach((playerName) => {
            const row = tableBody.insertRow();
            row.style.color = 'white';

            row.insertCell().innerHTML = `<strong>${playerName}</strong>`;
            
            const inputCell = row.insertCell();
            inputCell.style.textAlign = 'center';
            inputCell.innerHTML = `
                <input type="number" 
                       min="1" 
                       max="${numPlayers}" 
                       data-player="${playerName}" 
                       class="rank-input input-field" 
                       style="width: 70px; text-align: center;" 
                       placeholder="Rang">
            `;
        });
        
        document.getElementById('btnConfirmResults').onclick = () => confirmSettleModal(matchData.allOdds);
        document.getElementById('settleModal').style.display = 'block';

    } catch (e) {
        console.error("Erreur chargement modale:", e);
        alert("Erreur lors du chargement des données du match.");
    }
};

function confirmSettleModal(allOdds) {
    const tableBody = document.getElementById('resultsTableBody');
    const rows = tableBody.querySelectorAll('tr');
    const finalRankingArray = [];
    const ranksUsed = new Set();
    const modalError = document.getElementById('modalError');
    const matchId = currentSettleMatchId;

    for (const row of rows) {
        const input = row.querySelector('.rank-input');
        const playerName = input.getAttribute('data-player');
        const rankValue = parseInt(input.value);

        if (isNaN(rankValue) || rankValue < 1 || rankValue > rows.length) {
            modalError.innerText = `Erreur: Le rang de ${playerName} doit être entre 1 et ${rows.length}.`;
            modalError.style.display = 'block';
            return;
        }

        if (ranksUsed.has(rankValue)) {
            modalError.innerText = `Erreur: Le rang ${rankValue} a été attribué deux fois !`;
            modalError.style.display = 'block';
            return;
        }

        ranksUsed.add(rankValue);
        // On construit un tableau de noms indexé par le rang 
        finalRankingArray[rankValue] = playerName; 
    }
    
    // Si toutes les vérifications passent
    document.getElementById('settleModal').style.display = 'none';
    
    // finalRankingArray est un tableau creux : [empty, 1er_nom, 2eme_nom, ...]
    settleRankingMatch(matchId, finalRankingArray.slice(1), allOdds); 
}


async function settleRankingMatch(matchId, finalRankingArray, allOdds) {
    if (!confirm("Confirmer le classement final et distribuer les gains ?")) return;

    try {
        // 1. Mettre à jour le match avec le résultat
        const finalRanking = finalRankingArray.reduce((acc, name, index) => {
            acc[index + 1] = name; 
            return acc;
        }, {});
        
        await updateDoc(doc(db, "matches", matchId), { 
            status: 'settled', 
            finalRanking: finalRanking
        });

        // 2. Trouver tous les paris pour ce match
        const betsQuery = query(collection(db, "bets"), where("matchId", "==", matchId));
        const betsSnapshot = await getDocs(betsQuery);
        
        let totalWinningsPaid = 0;
        let totalCorrectPredictions = 0;

        if (!betsSnapshot.empty) {
            for (const betDoc of betsSnapshot.docs) {
                const bet = betDoc.data();
                
                const userPredictions = bet.prediction; 
                if (Object.keys(userPredictions).length === 0) continue; // Ignorer si le pari est vide

                let totalGainForBet = 0;
                
                // On vérifie chaque prédiction individuelle
                for (const predictedPlayer in userPredictions) {
                    const predictedRank = userPredictions[predictedPlayer];
                    
                    // Vérification : Le nom à ce rang dans le classement final est-il le nom prédit ?
                    const isCorrect = finalRanking[predictedRank] === predictedPlayer;

                    if (isCorrect) {
                        totalCorrectPredictions++;
                        
                        const cote = bet.odds[predictedPlayer][predictedRank];

                        // La mise est partagée entre les prédictions
                        const miseParPrediction = bet.amount / Object.keys(userPredictions).length;
                        const gainPartiel = Math.round(miseParPrediction * cote); 
                        totalGainForBet += gainPartiel;
                    }
                }
                
                if (totalGainForBet > 0) {
                     totalWinningsPaid += totalGainForBet;
                     const userId = bet.userId;
                    
                     const userRef = doc(db, "users", userId);
                     const userSnap = await getDoc(userRef);
                    
                     if (userSnap.exists()) {
                         const currentPoints = userSnap.data().cfPoints;
                         const newPoints = currentPoints + totalGainForBet; 
                         
                         await updateDoc(userRef, { cfPoints: newPoints });
                         await updateDoc(betDoc.ref, { isSettled: true, gain: totalGainForBet });
                     }
                } else {
                     await updateDoc(betDoc.ref, { isSettled: true, gain: 0 });
                }
            }
        }

        alert(`Règlement effectué ! Total des prédictions correctes: ${totalCorrectPredictions}. Total des gains distribués: ${totalWinningsPaid} CF.`);
        loadMatches();
    } catch (e) {
        console.error("Erreur règlement des gains:", e);
        alert("Erreur critique lors du règlement. Vérifiez la console.");
    }
}

// Expose les fonctions de gestion des matchs à la fenêtre
window.loadMatches = loadMatches;
window.closeBets = async (matchId) => {
    if (!confirm("Êtes-vous sûr de vouloir fermer les paris pour ce classement ?")) return;
    try {
        await updateDoc(doc(db, "matches", matchId), { status: 'closed' });
        alert(`Classement ${matchId} fermé. Prêt pour l'entrée des résultats.`);
        loadMatches();
    } catch (e) {
        console.error("Erreur fermeture:", e);
        alert("Erreur lors de la fermeture des paris.");
    }
};
window.openSettleModal = window.openSettleModal;