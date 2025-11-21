// js/admin.js

import { auth, db, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, onAuthStateChanged } from './firebase.js';
// On garde getAllPlayers pour la liste déroulante, mais on n'a plus besoin du calculateur de cotes ici
import { getAllPlayersWithStats } from './data-utils.js';

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
const MIN_PLAYERS = 8; 
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

// --- 2. CRÉATION DES SELECTEURS ---
function setupRankingSelects() {
    let html = '';
    // On trie alphabétiquement pour faciliter la recherche admin
    const sortedPlayers = [...allPlayers].sort((a,b) => a.name.localeCompare(b.name));
    const playerOptions = sortedPlayers.map(p => `<option value="${p.name}">${p.name}</option>`).join('');

    for (let i = 1; i <= MAX_RANKINGS; i++) {
        html += `
            <div class="form-group select-player">
                <label>Joueur ${i} ${i <= MIN_PLAYERS ? '(Requis)' : '(Optionnel)'}</label>
                <select id="rank-${i}" class="input-field">
                    <option value="">-- Sélectionner --</option>
                    ${playerOptions}
                </select>
            </div>
        `;
    }
    selectPlayerContainer.innerHTML = html;
    
    playerSelects = [];
    for (let i = 1; i <= MAX_RANKINGS; i++) {
        playerSelects.push(document.getElementById(`rank-${i}`));
    }
}

// --- 3. CRÉATION DE MATCH (SIMPLIFIÉE) ---
btnCreateMatch.addEventListener('click', async () => {
    const selectedPlayers = playerSelects.map(s => s.value).filter(name => name !== "");

    if (selectedPlayers.length < MIN_PLAYERS) {
        alert(`Il faut au moins ${MIN_PLAYERS} joueurs pour lancer un classement.`);
        return;
    }
    
    const uniquePlayers = new Set(selectedPlayers);
    if (uniquePlayers.size !== selectedPlayers.length) {
        alert("Erreur : Vous avez sélectionné le même joueur plusieurs fois !");
        return;
    }

    // On prépare juste la liste des joueurs
    const matchPlayers = {};
    selectedPlayers.forEach((playerName) => {
        matchPlayers[playerName] = { name: playerName };
    });

    // NOTE : On ne calcule PLUS les cotes ici. C'est le client (index.html) qui le fera en temps réel.
    // Cela allège considérablement la base de données.

    try {
        const matchId = `C-${Date.now()}`;
        await setDoc(doc(db, "matches", matchId), {
            type: 'ranking',
            players: matchPlayers, 
            // allOdds: odds,  <-- SUPPRIMÉ (Optimisation)
            status: 'open',
            finalRanking: {}, 
            createdAt: new Date().toISOString()
        });
        alert(`Classement ${matchId} ouvert aux paris !`);
        loadMatches();
        // Reset des sélecteurs
        playerSelects.forEach(s => s.value = "");
    } catch (e) {
        console.error("Erreur création:", e);
        alert("Erreur technique lors de la création.");
    }
});

// --- 4. LISTE DES MATCHS ---
async function loadMatches() {
    matchList.innerHTML = '<p style="color: #888; text-align: center;">Chargement...</p>';
    // On prend les 20 derniers matchs pour éviter de surcharger
    const q = query(collection(db, "matches")); // Vous pourrez ajouter un orderBy/limit plus tard
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
        matchList.innerHTML = '<p style="color: #888; text-align: center;">Aucun match.</p>';
        return;
    }

    matchList.innerHTML = '';
    // On inverse pour avoir les plus récents en haut (si l'ID est basé sur le temps)
    const docs = querySnapshot.docs.reverse(); 

    docs.forEach((doc) => {
        const match = doc.data();
        const matchId = doc.id;
        
        let statusClass, statusText, actionButton = '';
        const numPlayers = match.players ? Object.keys(match.players).length : 0;

        if (match.status === 'open') {
            statusClass = 'status-open';
            statusText = 'EN COURS';
            actionButton = `<button class="btn btn-action" onclick="closeBets('${matchId}')">STOP PARIS</button>`;
        } else if (match.status === 'closed') {
            statusClass = 'status-closed';
            statusText = 'ATTENTE RÉSULTATS';
            actionButton = `<button class="btn btn-action" style="background-color: green;" onclick="openSettleModal('${matchId}')">SAISIR RÉSULTATS</button>`;
        } else { 
            statusClass = 'status-settled';
            statusText = `TERMINÉ`;
        }

        matchList.innerHTML += `
            <div class="match-card">
                <div class="match-info">
                    <strong>${matchId}</strong>
                    <br><small style="color: #aaa;">${numPlayers} Joueurs</small>
                </div>
                <div style="text-align:right;">
                    <span class="match-status ${statusClass}" style="display:inline-block; margin-bottom:5px;">${statusText}</span>
                    <br>${actionButton}
                </div>
            </div>
        `;
    });
}

// --- 5. DISTRIBUTION DES GAINS ---

let currentSettleMatchId = null;

window.openSettleModal = async (matchId) => {
    currentSettleMatchId = matchId;
    document.getElementById('modalError').style.display = 'none';

    try {
        const matchDoc = await getDoc(doc(db, "matches", matchId));
        const matchData = matchDoc.data();
        const players = Object.keys(matchData.players);
        const numPlayers = players.length;

        document.getElementById('modalInfo').innerText = `Entrez le classement final (1 à ${numPlayers})`;

        const tableBody = document.getElementById('resultsTableBody');
        tableBody.innerHTML = ''; 

        players.forEach((playerName) => {
            const row = tableBody.insertRow();
            row.style.color = 'white';

            row.insertCell().innerHTML = `<strong>${playerName}</strong>`;
            
            const inputCell = row.insertCell();
            inputCell.innerHTML = `
                <input type="number" min="1" max="${numPlayers}" data-player="${playerName}" 
                       class="rank-input input-field" style="width: 60px; text-align: center; padding:5px;">
            `;
        });
        
        document.getElementById('btnConfirmResults').onclick = () => confirmSettleModal();
        document.getElementById('settleModal').style.display = 'block';

    } catch (e) {
        console.error("Erreur modale:", e);
    }
};

function confirmSettleModal() {
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
            modalError.innerText = `Erreur: Rang invalide pour ${playerName}`;
            modalError.style.display = 'block';
            return;
        }

        if (ranksUsed.has(rankValue)) {
            modalError.innerText = `Erreur: Le rang ${rankValue} est utilisé deux fois.`;
            modalError.style.display = 'block';
            return;
        }

        ranksUsed.add(rankValue);
        finalRankingArray[rankValue] = playerName; 
    }
    
    document.getElementById('settleModal').style.display = 'none';
    settleRankingMatch(matchId, finalRankingArray.slice(1)); 
}


async function settleRankingMatch(matchId, finalRankingArray) {
    if (!confirm("⚠️ ATTENTION : Cette action va payer les joueurs et est irréversible. Confirmer ?")) return;

    try {
        // 1. Sauvegarder le résultat final dans le match
        const finalRanking = finalRankingArray.reduce((acc, name, index) => {
            acc[index + 1] = name; 
            return acc;
        }, {});
        
        await updateDoc(doc(db, "matches", matchId), { 
            status: 'settled', 
            finalRanking: finalRanking
        });

        // 2. Récupérer et payer les paris
        const betsQuery = query(collection(db, "bets"), where("matchId", "==", matchId));
        const betsSnapshot = await getDocs(betsQuery);
        
        let totalWinningsPaid = 0;
        let totalBetsProcessed = 0;

        for (const betDoc of betsSnapshot.docs) {
            const bet = betDoc.data();
            if (bet.isSettled) continue; // Déjà payé (sécurité)

            const userPredictions = bet.prediction; 
            let totalGainForBet = 0;
            
            // Calcul des gains basé sur les cotes DANS LE TICKET (Historique)
            for (const predictedPlayer in userPredictions) {
                const predictedRank = userPredictions[predictedPlayer];
                const isCorrect = finalRanking[predictedRank] === predictedPlayer;

                if (isCorrect) {
                    // On récupère la cote qui était valide AU MOMENT DU PARI
                    const cote = bet.odds[predictedPlayer][predictedRank];
                    
                    // Calcul au prorata de la mise (si pari combiné implicite ou split)
                    // Dans ta logique actuelle, on divise la mise par le nombre de lignes
                    const miseParLigne = bet.amount / Object.keys(userPredictions).length;
                    
                    totalGainForBet += Math.floor(miseParLigne * cote); 
                }
            }
            
            // Paiement
            await updateDoc(betDoc.ref, { isSettled: true, gain: totalGainForBet });

            if (totalGainForBet > 0) {
                 totalWinningsPaid += totalGainForBet;
                 const userRef = doc(db, "users", bet.userId);
                 const userSnap = await getDoc(userRef);
                 if (userSnap.exists()) {
                     const newPoints = userSnap.data().cfPoints + totalGainForBet;
                     await updateDoc(userRef, { cfPoints: newPoints });
                 }
            }
            totalBetsProcessed++;
        }

        alert(`SUCCÈS !\n${totalBetsProcessed} paris traités.\n${totalWinningsPaid} CF distribués.`);
        loadMatches();

    } catch (e) {
        console.error("Erreur paiement:", e);
        alert("Erreur critique lors du paiement. Vérifiez la console.");
    }
}

// Expose les fonctions globales
window.loadMatches = loadMatches;
window.closeBets = async (matchId) => {
    if (!confirm("Fermer les paris ?")) return;
    try {
        await updateDoc(doc(db, "matches", matchId), { status: 'closed' });
        loadMatches();
    } catch (e) { console.error(e); }
};
window.openSettleModal = window.openSettleModal;