export async function requestNotificationPermission() {
    if (!("Notification" in window)) {
        console.log("Ce navigateur ne supporte pas les notifications");
        return false;
    }

    if (Notification.permission === "granted") {
        return true;
    }

    if (Notification.permission !== "denied") {
        const permission = await Notification.requestPermission();
        return permission === "granted";
    }

    return false;
}

// === 2. ENVOYER UNE NOTIFICATION ===
export function sendNotification(title, options = {}) {
    if (Notification.permission !== "granted") {
        console.log("Permission non accordée");
        return;
    }

    const defaultOptions = {
        icon: '/img/logo.png', // Ton logo
        badge: '/img/badge.png',
        vibrate: [200, 100, 200], // Vibration mobile
        requireInteraction: false, // Ne persiste pas
        ...options
    };

    const notification = new Notification(title, defaultOptions);

    // Redirection au clic
    notification.onclick = function(event) {
        event.preventDefault();
        window.focus();
        if (options.url) {
            window.location.href = options.url;
        }
        notification.close();
    };

    return notification;
}

// === 3. VÉRIFIER NOUVEAUX MATCHS (À APPELER PÉRIODIQUEMENT) ===
import { collection, query, where, getDocs, db } from './firebase.js';

let lastCheckTimestamp = Date.now();

export async function checkNewMatches() {
    try {
        const q = query(
            collection(db, "matches"),
            where("status", "==", "open"),
            where("createdAt", ">", new Date(lastCheckTimestamp).toISOString())
        );
        
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            const newMatchesCount = snapshot.size;
            sendNotification(
                `🎮 ${newMatchesCount} nouveau${newMatchesCount > 1 ? 'x' : ''} classement${newMatchesCount > 1 ? 's' : ''} !`,
                {
                    body: 'Placez vos paris avant la fermeture',
                    icon: '/img/match-icon.png',
                    url: '/paris.html',
                    tag: 'new-match', // Évite les doublons
                }
            );
        }
        
        lastCheckTimestamp = Date.now();
    } catch (error) {
        console.error("Erreur vérification matchs:", error);
    }
}

// === 4. VÉRIFIER RÉSULTATS DISPONIBLES ===
export async function checkResults(userId) {
    try {
        const betsQuery = query(
            collection(db, "bets"),
            where("userId", "==", userId),
            where("isSettled", "==", false)
        );
        
        const betsSnapshot = await getDocs(betsQuery);
        
        for (const betDoc of betsSnapshot.docs) {
            const bet = betDoc.data();
            const matchRef = await getDocs(query(
                collection(db, "matches"),
                where("__name__", "==", bet.matchId)
            ));
            
            if (!matchRef.empty) {
                const match = matchRef.docs[0].data();
                
                if (match.status === 'settled' && !bet.isSettled) {
                    // Ce pari a un résultat disponible !
                    sendNotification(
                        '🏆 Résultats disponibles !',
                        {
                            body: `Vérifiez si vous avez gagné sur ${bet.matchId}`,
                            icon: '/img/results-icon.png',
                            url: '/parishisto.html'
                        }
                    );
                }
            }
        }
    } catch (error) {
        console.error("Erreur vérification résultats:", error);
    }
}

// === 5. NOTIFICATION DE GROS GAIN (Social Proof) ===
export async function checkBigWins() {
    try {
        const recentWinsQuery = query(
            collection(db, "bets"),
            where("isSettled", "==", true),
            where("status", "==", "won"),
            where("gain", ">=", 500) // Gains supérieurs à 500 CF
        );
        
        const snapshot = await getDocs(recentWinsQuery);
        
        // Prendre le dernier gros gain
        if (!snapshot.empty) {
            const lastBigWin = snapshot.docs[0].data();
            
            // Récupérer le pseudo du gagnant
            const userRef = await getDoc(doc(db, "users", lastBigWin.userId));
            const pseudo = userRef.exists() ? userRef.data().pseudo : "Un joueur";
            
            sendNotification(
                `💰 ${pseudo} vient de gagner ${lastBigWin.gain} CF !`,
                {
                    body: 'Tentez votre chance vous aussi',
                    icon: '/img/trophy.png',
                    url: '/paris.html'
                }
            );
        }
    } catch (error) {
        console.error("Erreur big wins:", error);
    }
}