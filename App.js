import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Image, ActivityIndicator, Linking
} from 'react-native';
import { db } from './firebase';
import { collection, addDoc, getDocs, orderBy, query, updateDoc, doc } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const COULEURS = {
  noir: '#0D0D0D',
  noirCarte: '#1A1A1A',
  noirInput: '#2A2A2A',
  orange: '#E07B1A',
  orangeClair: '#F5A623',
  blanc: '#FFFFFF',
  gris: '#888888',
  grisClair: '#333333',
};

export default function App() {
  const [splash, setSplash] = useState(true);
  const [ecran, setEcran] = useState('accueil');
  const [alertes, setAlertes] = useState([]);
  const [alerteSelectee, setAlerteSelectee] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState('tous');
  const [utilisateur, setUtilisateur] = useState(null);
  const [authMode, setAuthMode] = useState('connexion');
  const [authForm, setAuthForm] = useState({ nom: '', email: '', motDePasse: '' });
  const [authErreur, setAuthErreur] = useState('');
  const [onglet, setOnglet] = useState('accueil');
  const [etape, setEtape] = useState(1);
  const [vuesSession, setVuesSession] = useState([]);
  const [voirMotDePasse, setVoirMotDePasse] = useState(false);
  const [form, setForm] = useState({
    nom: '', age: '', type: 'enfant',
    description: '', localisation: '', contact: '',
    taille: '', autresInfos: '', photo: null,
    latitude: null, longitude: null
  });

  const demanderPermissionNotification = async () => {
    await Notifications.requestPermissionsAsync();
  };

  const envoyerNotification = async (titre, message) => {
    await Notifications.scheduleNotificationAsync({
      content: { title: titre, body: message, sound: true },
      trigger: null,
    });
  };

  const partagerWhatsApp = (alerte) => {
    const message =
      `🚨 *ALERTE DAMA RÉER* 🚨\n\n` +
      `👤 *Nom:* ${alerte.nom}, ${alerte.age} ans\n` +
      `📋 *Type:* ${alerte.type === 'enfant' ? 'Enfant perdu' : alerte.type === 'desoriente' ? 'Personne désorientée' : 'Trouble mental'}\n` +
      `📝 *Description:* ${alerte.description}\n` +
      `📍 *Vu(e) à:* ${alerte.localisation}\n` +
      `📅 *Date:* ${alerte.dateTexte}\n` +
      `📞 *Contact famille:* ${alerte.contact}\n\n` +
      `⚠️ Si vous avez des informations, contactez la famille !\n` +
      `_Partagé via Dama Réer_`;
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    Linking.canOpenURL(url).then(supported => {
      if (supported) Linking.openURL(url);
      else alert('WhatsApp n\'est pas installé !');
    });
  };

  // Charger alertes depuis Firebase
  const chargerAlertes = async () => {
    setChargement(true);
    try {
      const q = collection(db, 'alertes');
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAlertes(data);
    } catch (e) {
      console.log('Erreur chargement Firebase:', e);
    }
    setChargement(false);
  };

  const verifierSession = async () => {
    try {
      const session = await AsyncStorage.getItem('utilisateur');
      if (session) setUtilisateur(JSON.parse(session));
    } catch (e) { }
  };

  useEffect(() => {
    verifierSession();
    chargerAlertes();
    demanderPermissionNotification();
  }, []);

  const incrementerVues = async (alerte) => {
    if (vuesSession.includes(alerte.id)) return;
    setVuesSession([...vuesSession, alerte.id]);
    try {
      const alerteRef = doc(db, 'alertes', alerte.id);
      await updateDoc(alerteRef, { vues: (alerte.vues || 0) + 1 });
      setAlertes(alertes.map(a =>
        a.id === alerte.id ? { ...a, vues: (a.vues || 0) + 1 } : a
      ));
    } catch (e) { console.log('Erreur vues:', e); }
  };

  const marquerRetrouve = async (alerte) => {
    try {
      const alerteRef = doc(db, 'alertes', alerte.id);
      await updateDoc(alerteRef, {
        retrouve: true,
        dateRetrouve: new Date().toLocaleDateString('fr-FR')
      });
      const nouvelles = alertes.map(a =>
        a.id === alerte.id ? { ...a, retrouve: true, dateRetrouve: new Date().toLocaleDateString('fr-FR') } : a
      );
      setAlertes(nouvelles);
      setAlerteSelectee({ ...alerte, retrouve: true, dateRetrouve: new Date().toLocaleDateString('fr-FR') });
      await envoyerNotification('🎉 Bonne nouvelle !', `${alerte.nom} a été retrouvé(e) !`);
      alert(`🎉 ${alerte.nom} marqué(e) comme retrouvé(e) !`);
    } catch (e) { alert('Erreur : ' + e.message); }
  };

  const inscrire = async () => {
    setAuthErreur('');
    if (!authForm.nom || !authForm.email || !authForm.motDePasse) {
      setAuthErreur('Remplis tous les champs !'); return;
    }
    if (authForm.motDePasse.length < 6) {
      setAuthErreur('Mot de passe trop court (min 6 caractères)'); return;
    }
    try {
      const comptes = JSON.parse(await AsyncStorage.getItem('comptes') || '[]');
      const existe = comptes.find(c => c.email === authForm.email);
      if (existe) { setAuthErreur('Email déjà utilisé !'); return; }
      const nouveauCompte = { nom: authForm.nom, email: authForm.email, motDePasse: authForm.motDePasse };
      comptes.push(nouveauCompte);
      await AsyncStorage.setItem('comptes', JSON.stringify(comptes));
      await AsyncStorage.setItem('utilisateur', JSON.stringify(nouveauCompte));
      setUtilisateur(nouveauCompte);
      setEcran('accueil');
    } catch (e) { setAuthErreur('Erreur : ' + e.message); }
  };

  const connecter = async () => {
    setAuthErreur('');
    if (!authForm.email || !authForm.motDePasse) {
      setAuthErreur('Remplis tous les champs !'); return;
    }
    try {
      const comptes = JSON.parse(await AsyncStorage.getItem('comptes') || '[]');
      const compte = comptes.find(c => c.email === authForm.email && c.motDePasse === authForm.motDePasse);
      if (!compte) { setAuthErreur('Email ou mot de passe incorrect !'); return; }
      await AsyncStorage.setItem('utilisateur', JSON.stringify(compte));
      setUtilisateur(compte);
      setEcran('accueil');
    } catch (e) { setAuthErreur('Erreur : ' + e.message); }
  };

  const deconnecter = async () => {
    await AsyncStorage.removeItem('utilisateur');
    setUtilisateur(null);
  };

  const alertesFiltrees = alertes
    .filter(a =>
      (filtre === 'tous' || a.type === filtre) &&
      (a.nom.toLowerCase().includes(recherche.toLowerCase()) ||
      a.localisation.toLowerCase().includes(recherche.toLowerCase()) ||
      a.description.toLowerCase().includes(recherche.toLowerCase()))
    )
    .sort((a, b) => (a.retrouve ? 1 : 0) - (b.retrouve ? 1 : 0));

  const choisirPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { alert('Permission refusée !'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.5,
    });
    if (!result.canceled) setForm({ ...form, photo: result.assets[0].uri });
  };

  const obtenirLocalisation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) { alert('Permission refusée !'); return; }
    const loc = await Location.getCurrentPositionAsync({});
    setForm({ ...form, latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    alert('📍 Localisation GPS obtenue !');
  };

  // Publier alerte dans Firebase
  const publierAlerte = async () => {
    if (!form.nom || !form.description || !form.localisation || !form.contact) {
      alert('Remplis tous les champs obligatoires !'); return;
    }
    setEnvoi(true);
    try {
      const nouvelleAlerte = {
        ...form,
        dateTexte: new Date().toLocaleDateString('fr-FR'),
        timestamp: Date.now(),
        photo: form.photo || `https://via.placeholder.com/80x80/E07B1A/ffffff?text=${form.nom[0]}`,
        publiePar: utilisateur ? utilisateur.nom : 'Anonyme',
        retrouve: false,
        vues: 0,
      };
      const docRef = await addDoc(collection(db, 'alertes'), nouvelleAlerte);
      setAlertes([{ id: docRef.id, ...nouvelleAlerte }, ...alertes]);
      await envoyerNotification('🚨 Nouvelle alerte Dama Réer !', `${form.nom} signalé(e) à ${form.localisation}`);
      setForm({ nom: '', age: '', type: 'enfant', description: '', localisation: '', contact: '', taille: '', autresInfos: '', photo: null, latitude: null, longitude: null });
      setEtape(1);
      setEcran('confirmation');
    } catch (e) { alert('Erreur : ' + e.message); }
    setEnvoi(false);
  };

  const LogoTete = () => (
    <View style={styles.logoIconContainer}>
      <View style={styles.logoTete}>
        <Text style={styles.logoTeteEmoji}>👤</Text>
      </View>
      <View style={styles.logoArc} />
    </View>
  );

  const NavBar = () => (
    <View style={styles.navbar}>
      <TouchableOpacity style={styles.navItem} onPress={() => { setOnglet('accueil'); setEcran('accueil'); }}>
        <Text style={styles.navIcon}>🏠</Text>
        <Text style={[styles.navLabel, onglet === 'accueil' && styles.navLabelActif]}>Accueil</Text>
        {onglet === 'accueil' && <View style={styles.navIndicateur} />}
      </TouchableOpacity>
      <TouchableOpacity style={styles.navItem} onPress={() => { setOnglet('alertes'); setEcran('alertes'); }}>
        <Text style={styles.navIcon}>🔔</Text>
        <Text style={[styles.navLabel, onglet === 'alertes' && styles.navLabelActif]}>Alertes</Text>
        {onglet === 'alertes' && <View style={styles.navIndicateur} />}
      </TouchableOpacity>
      <TouchableOpacity style={styles.navBtnPlus} onPress={() => { setEtape(1); setEcran('publier'); }}>
        <Text style={styles.navBtnPlusText}>+</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.navItem} onPress={() => { setOnglet('communaute'); setEcran('communaute'); }}>
        <Text style={styles.navIcon}>👥</Text>
        <Text style={[styles.navLabel, onglet === 'communaute' && styles.navLabelActif]}>Communauté</Text>
        {onglet === 'communaute' && <View style={styles.navIndicateur} />}
      </TouchableOpacity>
      <TouchableOpacity style={styles.navItem} onPress={() => { setOnglet('profil'); setEcran('profil'); }}>
        <Text style={styles.navIcon}>👤</Text>
        <Text style={[styles.navLabel, onglet === 'profil' && styles.navLabelActif]}>Profil</Text>
        {onglet === 'profil' && <View style={styles.navIndicateur} />}
      </TouchableOpacity>
    </View>
  );

  const IndicateurEtapes = () => (
    <View style={styles.etapesContainer}>
      {[1, 2, 3].map(n => (
        <View key={n} style={styles.etapeRow}>
          <View style={[styles.etapeCercle, etape >= n && styles.etapeCercleActif]}>
            <Text style={[styles.etapeNum, etape >= n && styles.etapeNumActif]}>{n}</Text>
          </View>
          {n < 3 && <View style={[styles.etapeLigne, etape > n && styles.etapeLigneActif]} />}
        </View>
      ))}
    </View>
  );

  if (splash) return (
    <View style={styles.splashContainer}>
      <View style={styles.splashHeader}>
        <LogoTete />
        <View>
          <Text style={styles.splashTitre}>DAMA <Text style={{ color: COULEURS.orange }}>RÉER</Text></Text>
          <Text style={styles.splashSousTitre}>Ensemble, retrouvons ceux qui comptent.</Text>
        </View>
      </View>
      <View style={styles.splashEnfant}>
        <Text style={styles.splashEmoji}>👦🏿</Text>
        <Text style={styles.splashPhrase}>
          <Text style={{ color: COULEURS.orange, fontWeight: 'bold' }}>Chaque alerte</Text>{'\n'}peut sauver une vie.
        </Text>
        <Text style={styles.splashDesc}>
          Dama Réer est une application solidaire qui permet à chacun d'agir rapidement pour retrouver les enfants perdus, les personnes désorientées ou atteintes de troubles mentaux.
        </Text>
      </View>
      <View style={styles.splashFeatures}>
        {[
          { icon: '⚡', label: 'Signalement\nrapide' },
          { icon: '👥', label: 'Partage\ninstantané' },
          { icon: '🤝', label: 'Aide\ncommunautaire' },
          { icon: '🛡️', label: 'Sécurité &\nconfiance' },
        ].map((f, i) => (
          <View key={i} style={styles.splashFeatureItem}>
            <View style={styles.splashFeatureIconContainer}>
              <Text style={styles.splashFeatureIcon}>{f.icon}</Text>
            </View>
            <Text style={styles.splashFeatureText}>{f.label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.splashFooter}>
        <Text style={styles.splashFooterTitre}>DAMA RÉER, L'ESPOIR DE RETROUVER.</Text>
        <TouchableOpacity style={styles.splashBtn} onPress={() => setSplash(false)}>
          <Text style={styles.splashBtnText}>Commencer →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (ecran === 'accueil') return (
    <View style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <View style={styles.headerLogo}>
            <LogoTete />
            <View>
              <View style={{ flexDirection: 'row' }}>
                <Text style={styles.logo}>DAMA </Text>
                <Text style={styles.logoOrange}>RÉER</Text>
              </View>
              <Text style={styles.headerSlogan}>ENSEMBLE, RETROUVONS CEUX <Text style={styles.orangeText}>QUI COMPTENT.</Text></Text>
            </View>
          </View>
        </View>
        <View style={styles.boutonsPrincipaux}>
          <TouchableOpacity style={styles.btnSignaler} onPress={() => { setEtape(1); setEcran('publier'); }}>
            <View style={styles.btnIconContainer}><Text style={styles.btnMainIcon}>🔔</Text></View>
            <View style={styles.btnTextContainer}>
              <Text style={styles.btnMainTitre}>SIGNALER{'\n'}UNE PERSONNE</Text>
              <Text style={styles.btnMainSous}>Enfant perdu, personne{'\n'}désorientée, trouble mental</Text>
            </View>
            <Text style={styles.btnArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnVoir} onPress={() => { setOnglet('alertes'); setEcran('alertes'); }}>
            <View style={styles.btnIconContainer}><Text style={styles.btnMainIcon}>👥</Text></View>
            <View style={styles.btnTextContainer}>
              <Text style={styles.btnMainTitre}>VOIR LES{'\n'}SIGNALEMENTS</Text>
              <Text style={styles.btnMainSous}>Consulter les alertes{'\n'}de la communauté</Text>
            </View>
            <Text style={styles.btnArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnNumeros} onPress={() => setEcran('numeros')}>
            <View style={styles.btnIconContainer}><Text style={styles.btnMainIcon}>📞</Text></View>
            <View style={styles.btnTextContainer}>
              <Text style={styles.btnMainTitre}>NUMÉROS UTILES</Text>
              <Text style={styles.btnMainSous}>Contacts importants{'\n'}et urgences</Text>
            </View>
            <Text style={styles.btnArrow}>›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statNombre}>{alertes.filter(a => !a.retrouve).length}</Text>
            <Text style={styles.statLabel}>Alertes actives</Text>
          </View>
          <View style={styles.statSeparateur} />
          <View style={styles.statItem}>
            <Text style={styles.statNombre}>{alertes.filter(a => a.retrouve).length}</Text>
            <Text style={styles.statLabel}>Retrouvés 🎉</Text>
          </View>
          <View style={styles.statSeparateur} />
          <View style={styles.statItem}>
            <Text style={styles.statNombre}>{alertes.reduce((s, a) => s + (a.vues || 0), 0)}</Text>
            <Text style={styles.statLabel}>Vues totales</Text>
          </View>
        </View>
        <Text style={styles.sectionTitre}>Alertes récentes</Text>
        {chargement ? (
          <ActivityIndicator size="large" color={COULEURS.orange} style={{ marginTop: 20 }} />
        ) : alertes.filter(a => !a.retrouve).slice(0, 3).map(alerte => (
          <TouchableOpacity key={alerte.id} style={styles.carteAlerte}
            onPress={() => { incrementerVues(alerte); setAlerteSelectee(alerte); setEcran('detail'); }}>
            <Image source={{ uri: alerte.photo }} style={styles.photo} />
            <View style={styles.carteInfo}>
              <View style={[styles.carteBadge, alerte.type === 'enfant' ? styles.badgeEnfant : alerte.type === 'desoriente' ? styles.badgeDesoriente : styles.badgeMental]}>
                <Text style={styles.carteBadgeText}>{alerte.type === 'enfant' ? 'Enfant perdu' : alerte.type === 'desoriente' ? 'Désorienté' : 'Trouble mental'}</Text>
              </View>
              <Text style={styles.carteNom}>{alerte.nom}, {alerte.age} ans</Text>
              <Text style={styles.carteLoc}>Lieu: {alerte.localisation}</Text>
              <Text style={styles.carteTemps}>👁️ {alerte.vues || 0} vues · {alerte.dateTexte}</Text>
            </View>
            <Text style={styles.carteArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <NavBar />
    </View>
  );

  if (ecran === 'alertes') return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitre}>Alertes récentes</Text>
      </View>
      <View style={styles.rechercheContainer}>
        <TextInput style={styles.rechercheInput} placeholder="Rechercher une alerte..." placeholderTextColor={COULEURS.gris} value={recherche} onChangeText={setRecherche} />
        <Text style={styles.rechercheIcon}>🔍</Text>
      </View>
      <View style={styles.filtresRow}>
        {['tous', 'enfant', 'desoriente', 'mental'].map(f => (
          <TouchableOpacity key={f} style={[styles.filtrBtn, filtre === f && styles.filtrBtnActif]} onPress={() => setFiltre(f)}>
            <Text style={[styles.filtrText, filtre === f && styles.filtrTextActif]}>
              {f === 'tous' ? 'Tous' : f === 'enfant' ? '👶' : f === 'desoriente' ? '🧭' : '🧠'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {chargement ? (
        <ActivityIndicator size="large" color={COULEURS.orange} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView style={{ paddingHorizontal: 15 }}>
          {alertesFiltrees.length === 0 && (
            <Text style={{ textAlign: 'center', color: COULEURS.gris, marginTop: 30 }}>😕 Aucun résultat</Text>
          )}
          {alertesFiltrees.map(alerte => (
            <TouchableOpacity key={alerte.id}
              style={[styles.carteAlerte, alerte.retrouve && styles.carteRetrouve]}
              onPress={() => { incrementerVues(alerte); setAlerteSelectee(alerte); setEcran('detail'); }}>
              <Image source={{ uri: alerte.photo }} style={styles.photo} />
              <View style={styles.carteInfo}>
                <View style={[styles.carteBadge, alerte.retrouve ? styles.badgeRetrouve : alerte.type === 'enfant' ? styles.badgeEnfant : alerte.type === 'desoriente' ? styles.badgeDesoriente : styles.badgeMental]}>
                  <Text style={styles.carteBadgeText}>{alerte.retrouve ? '✅ Retrouvé' : alerte.type === 'enfant' ? 'Enfant perdu' : alerte.type === 'desoriente' ? 'Désorienté' : 'Trouble mental'}</Text>
                </View>
                <Text style={styles.carteNom}>{alerte.nom}, {alerte.age} ans</Text>
                <Text style={styles.carteLoc}>Lieu: {alerte.localisation}</Text>
                <Text style={styles.carteTemps}>👁️ {alerte.vues || 0} · {alerte.dateTexte}</Text>
                {!alerte.retrouve && (
                  <TouchableOpacity style={styles.btnPartageRapide} onPress={() => partagerWhatsApp(alerte)}>
                    <Text style={styles.btnPartageRapideText}>📲 Partager WhatsApp</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.carteArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <NavBar />
    </View>
  );

  if (ecran === 'publier' && etape === 1) return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setEcran('accueil')}>
          <Text style={styles.retour}>← Créer un signalement</Text>
        </TouchableOpacity>
      </View>
      <IndicateurEtapes />
      <ScrollView style={{ padding: 15 }}>
        <Text style={styles.etapeTitre}>Informations de base</Text>
        <Text style={styles.label}>Type de personne *</Text>
        <View style={styles.typeCol}>
          {['enfant', 'desoriente', 'mental'].map(t => (
            <TouchableOpacity key={t} style={[styles.typeRadio, form.type === t && styles.typeRadioActif]} onPress={() => setForm({ ...form, type: t })}>
              <View style={[styles.typeRadioCercle, form.type === t && styles.typeRadioCercleActif]} />
              <Text style={[styles.typeRadioText, form.type === t && styles.typeRadioTextActif]}>
                {t === 'enfant' ? 'Enfant perdu' : t === 'desoriente' ? 'Personne désorientée' : 'Trouble mental'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Photo de la personne</Text>
        <TouchableOpacity style={styles.photoContainer} onPress={choisirPhoto}>
          {form.photo ? (
            <Image source={{ uri: form.photo }} style={styles.photoPreview} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={{ fontSize: 30, color: COULEURS.gris }}>📷</Text>
              <Text style={{ color: COULEURS.gris, marginTop: 8 }}>Ajouter une photo</Text>
            </View>
          )}
        </TouchableOpacity>
        <Text style={styles.label}>Nom complet *</Text>
        <TextInput style={styles.input} placeholder="Ex: Mamadou Diallo" placeholderTextColor={COULEURS.gris} value={form.nom} onChangeText={t => setForm({ ...form, nom: t })} />
        <Text style={styles.label}>Contact famille *</Text>
        <TextInput style={styles.input} placeholder="Ex: 77 123 45 67" placeholderTextColor={COULEURS.gris} keyboardType="phone-pad" value={form.contact} onChangeText={t => setForm({ ...form, contact: t })} />
        <TouchableOpacity style={styles.btnSuivant} onPress={() => {
          if (!form.nom || !form.contact) { alert('Remplis les champs obligatoires !'); return; }
          setEtape(2);
        }}>
          <Text style={styles.btnSuivantText}>Suivant →</Text>
        </TouchableOpacity>
      </ScrollView>
      <NavBar />
    </View>
  );

  if (ecran === 'publier' && etape === 2) return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setEtape(1)}>
          <Text style={styles.retour}>← Retour</Text>
        </TouchableOpacity>
      </View>
      <IndicateurEtapes />
      <ScrollView style={{ padding: 15 }}>
        <Text style={styles.etapeTitre}>Lieu de disparition</Text>
        <Text style={styles.label}>Point sur la carte</Text>
        <TouchableOpacity style={styles.btnOrange} onPress={obtenirLocalisation}>
          <Text style={styles.btnOrangeText}>{form.latitude ? '✅ Position GPS obtenue !' : '📍 Obtenir ma position GPS'}</Text>
        </TouchableOpacity>
        {form.latitude && form.longitude && (
          <MapView style={styles.carteForm} initialRegion={{ latitude: form.latitude, longitude: form.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }}>
            <Marker coordinate={{ latitude: form.latitude, longitude: form.longitude }} />
          </MapView>
        )}
        <Text style={styles.label}>Localisation (texte) *</Text>
        <TextInput style={styles.input} placeholder="Ex: Dakar, Médina" placeholderTextColor={COULEURS.gris} value={form.localisation} onChangeText={t => setForm({ ...form, localisation: t })} />
        <Text style={styles.label}>Description *</Text>
        <TextInput style={[styles.input, { height: 100 }]} placeholder="Décrivez la personne, ses vêtements, signes particuliers..." placeholderTextColor={COULEURS.gris} multiline value={form.description} onChangeText={t => setForm({ ...form, description: t })} />
        <TouchableOpacity style={styles.btnSuivant} onPress={() => {
          if (!form.localisation || !form.description) { alert('Remplis les champs obligatoires !'); return; }
          setEtape(3);
        }}>
          <Text style={styles.btnSuivantText}>Suivant →</Text>
        </TouchableOpacity>
      </ScrollView>
      <NavBar />
    </View>
  );

  if (ecran === 'publier' && etape === 3) return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setEtape(2)}>
          <Text style={styles.retour}>← Retour</Text>
        </TouchableOpacity>
      </View>
      <IndicateurEtapes />
      <ScrollView style={{ padding: 15 }}>
        <Text style={styles.etapeTitre}>Informations supplémentaires</Text>
        <Text style={styles.label}>Âge approximatif *</Text>
        <TextInput style={styles.input} placeholder="Ex: 10 ans" placeholderTextColor={COULEURS.gris} keyboardType="numeric" value={form.age} onChangeText={t => setForm({ ...form, age: t })} />
        <Text style={styles.label}>Taille approximative</Text>
        <TextInput style={styles.input} placeholder="Ex: 1m30" placeholderTextColor={COULEURS.gris} value={form.taille} onChangeText={t => setForm({ ...form, taille: t })} />
        <Text style={styles.label}>Autres informations</Text>
        <TextInput style={[styles.input, { height: 80 }]} placeholder="Toute information utile..." placeholderTextColor={COULEURS.gris} multiline value={form.autresInfos} onChangeText={t => setForm({ ...form, autresInfos: t })} />
        <TouchableOpacity style={[styles.btnSuivant, envoi && { opacity: 0.6 }]} onPress={publierAlerte} disabled={envoi}>
          {envoi ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnSuivantText}>Publier l'alerte 🚨</Text>}
        </TouchableOpacity>
      </ScrollView>
      <NavBar />
    </View>
  );

  if (ecran === 'confirmation') return (
    <View style={styles.container}>
      <View style={styles.confirmationContent}>
        <View style={styles.confirmationCercle}>
          <Text style={styles.confirmationCheck}>✓</Text>
        </View>
        <Text style={styles.confirmationTitre}>Alerte publiée !</Text>
        <Text style={styles.confirmationTexte}>Votre alerte a été publiée avec succès et partagée avec la communauté.</Text>
        <TouchableOpacity style={styles.btnSuivant} onPress={() => { setOnglet('alertes'); setEcran('alertes'); }}>
          <Text style={styles.btnSuivantText}>Voir mon alerte</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnTransparent} onPress={() => { setOnglet('accueil'); setEcran('accueil'); }}>
          <Text style={styles.btnTransparentText}>Retour à l'accueil</Text>
        </TouchableOpacity>
      </View>
      <NavBar />
    </View>
  );

  if (ecran === 'detail' && alerteSelectee) return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setEcran(onglet)}>
          <Text style={styles.retour}>← Détails du signalement</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ padding: 15 }}>
        <Image source={{ uri: alerteSelectee.photo }} style={styles.photoDetail} />
        <Text style={styles.detailNom}>{alerteSelectee.nom}</Text>
        <Text style={styles.detailVues}>👁️ {alerteSelectee.vues || 0} personnes ont vu cette alerte</Text>
        <View style={[styles.carteBadge, alerteSelectee.retrouve ? styles.badgeRetrouve : alerteSelectee.type === 'enfant' ? styles.badgeEnfant : alerteSelectee.type === 'desoriente' ? styles.badgeDesoriente : styles.badgeMental, { alignSelf: 'center', marginBottom: 15, paddingHorizontal: 15, paddingVertical: 8 }]}>
          <Text style={[styles.carteBadgeText, { fontSize: 14 }]}>
            {alerteSelectee.retrouve ? '✅ Retrouvé(e)' : alerteSelectee.type === 'enfant' ? 'Enfant perdu' : alerteSelectee.type === 'desoriente' ? 'Personne désorientée' : 'Trouble mental'}
          </Text>
        </View>
        {alerteSelectee.retrouve && (
          <View style={styles.messageRetrouve}>
            <Text style={styles.messageRetrouveText}>🎉 Retrouvé(e) le {alerteSelectee.dateRetrouve}. Merci !</Text>
          </View>
        )}
        <View style={styles.infoBox}><Text style={styles.infoLabel}>📋 Description</Text><Text style={styles.infoValeur}>{alerteSelectee.description}</Text></View>
        <View style={styles.infoBox}><Text style={styles.infoLabel}>📍 Localisation</Text><Text style={styles.infoValeur}>{alerteSelectee.localisation}</Text></View>
        {alerteSelectee.age && <View style={styles.infoBox}><Text style={styles.infoLabel}>🎂 Âge</Text><Text style={styles.infoValeur}>{alerteSelectee.age} ans</Text></View>}
        {alerteSelectee.taille && <View style={styles.infoBox}><Text style={styles.infoLabel}>📏 Taille</Text><Text style={styles.infoValeur}>{alerteSelectee.taille}</Text></View>}
        {alerteSelectee.autresInfos && <View style={styles.infoBox}><Text style={styles.infoLabel}>ℹ️ Autres infos</Text><Text style={styles.infoValeur}>{alerteSelectee.autresInfos}</Text></View>}
        {alerteSelectee.latitude && alerteSelectee.longitude && (
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>🗺️ Carte</Text>
            <MapView style={styles.carte} initialRegion={{ latitude: alerteSelectee.latitude, longitude: alerteSelectee.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }}>
              <Marker coordinate={{ latitude: alerteSelectee.latitude, longitude: alerteSelectee.longitude }} title={alerteSelectee.nom} />
            </MapView>
          </View>
        )}
        <View style={styles.infoBox}><Text style={styles.infoLabel}>📅 Date</Text><Text style={styles.infoValeur}>{alerteSelectee.dateTexte}</Text></View>
        {alerteSelectee.publiePar && <View style={styles.infoBox}><Text style={styles.infoLabel}>👤 Publié par</Text><Text style={styles.infoValeur}>{alerteSelectee.publiePar}</Text></View>}
        {!alerteSelectee.retrouve && (
          <>
            <TouchableOpacity style={styles.btnSuivant} onPress={() => Linking.openURL(`tel:${alerteSelectee.contact}`)}>
              <Text style={styles.btnSuivantText}>📞 Appeler la famille</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnWhatsApp} onPress={() => partagerWhatsApp(alerteSelectee)}>
              <Text style={styles.btnWhatsAppText}>📲 Partager sur WhatsApp</Text>
            </TouchableOpacity>
            {utilisateur && (
              <TouchableOpacity style={styles.btnVert} onPress={() => marquerRetrouve(alerteSelectee)}>
                <Text style={styles.btnVertText}>✅ Marquer comme retrouvé(e)</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
      <NavBar />
    </View>
  );

  if (ecran === 'numeros') return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setEcran('accueil')}><Text style={styles.retour}>← Retour</Text></TouchableOpacity>
        <Text style={styles.headerTitre}>📞 Numéros Utiles</Text>
      </View>
      <ScrollView style={{ padding: 15 }}>
        {[
          { nom: 'Police Nationale', numero: '17', icon: '👮' },
          { nom: 'Gendarmerie', numero: '800 00 20 20', icon: '🚔' },
          { nom: 'SAMU', numero: '15', icon: '🚑' },
          { nom: 'Pompiers', numero: '18', icon: '🚒' },
          { nom: 'SOS Enfants', numero: '116', icon: '👶' },
          { nom: 'Santé Mentale Sénégal', numero: '33 839 39 39', icon: '🧠' },
        ].map((item, index) => (
          <TouchableOpacity key={index} style={styles.numeroCard} onPress={() => Linking.openURL(`tel:${item.numero}`)}>
            <Text style={styles.numeroIcon}>{item.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.numeroNom}>{item.nom}</Text>
              <Text style={styles.numeroVal}>{item.numero}</Text>
            </View>
            <Text style={{ color: COULEURS.orange, fontWeight: 'bold' }}>📞</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <NavBar />
    </View>
  );

  if (ecran === 'communaute') return (
    <View style={styles.container}>
      <View style={styles.header}><Text style={styles.headerTitre}>👥 Communauté</Text></View>
      <ScrollView style={{ padding: 15 }}>
        <View style={styles.infoBox}>
          <Text style={styles.communauteTitre}>🇸🇳 Dama Réer au Sénégal</Text>
          <Text style={styles.communauteTexte}>"Dama Réer" signifie <Text style={{ color: COULEURS.orange, fontWeight: 'bold' }}>"Je suis perdu"</Text> en Wolof. Notre mission est d'aider les familles sénégalaises à retrouver leurs proches grâce à la solidarité communautaire.</Text>
        </View>
        <View style={styles.statsContainer}>
          <View style={styles.statItem}><Text style={styles.statNombre}>{alertes.length}</Text><Text style={styles.statLabel}>Signalements</Text></View>
          <View style={styles.statSeparateur} />
          <View style={styles.statItem}><Text style={styles.statNombre}>{alertes.filter(a => a.retrouve).length}</Text><Text style={styles.statLabel}>Retrouvés 🎉</Text></View>
          <View style={styles.statSeparateur} />
          <View style={styles.statItem}><Text style={styles.statNombre}>{alertes.reduce((s, a) => s + (a.vues || 0), 0)}</Text><Text style={styles.statLabel}>Vues 👁️</Text></View>
        </View>
        <View style={styles.infoBox}>
          <Text style={styles.communauteTitre}>💡 Comment aider ?</Text>
          <Text style={styles.communauteTexte}>• Partagez les alertes sur WhatsApp{'\n'}• Signalez si vous voyez quelqu'un{'\n'}• Contactez la famille directement{'\n'}• Encouragez votre entourage à installer l'appli</Text>
        </View>
        <View style={styles.infoBox}>
          <Text style={styles.communauteTitre}>🏆 Notre impact</Text>
          <Text style={styles.communauteTexte}>Chaque alerte partagée augmente les chances de retrouver une personne. Ensemble, nous pouvons faire la différence dans nos communautés.</Text>
        </View>
      </ScrollView>
      <NavBar />
    </View>
  );

  if (ecran === 'profil') return (
    <View style={styles.container}>
      <View style={styles.header}><Text style={styles.headerTitre}>👤 Profil</Text></View>
      <ScrollView style={{ padding: 15 }}>
        {utilisateur ? (
          <>
            <View style={styles.profilCard}>
              <Text style={styles.profilAvatar}>👤</Text>
              <Text style={styles.profilNom}>{utilisateur.nom}</Text>
              <Text style={styles.profilEmail}>{utilisateur.email}</Text>
            </View>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Mes alertes publiées</Text>
              <Text style={styles.infoValeur}>{alertes.filter(a => a.publiePar === utilisateur.nom).length} alerte(s)</Text>
            </View>
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>👁️ Vues sur mes alertes</Text>
              <Text style={styles.infoValeur}>{alertes.filter(a => a.publiePar === utilisateur.nom).reduce((s, a) => s + (a.vues || 0), 0)} vues</Text>
            </View>
            <TouchableOpacity style={styles.btnDeconnexion} onPress={deconnecter}>
              <Text style={styles.btnDeconnexionText}>🚪 Se déconnecter</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.profilCard}>
              <Text style={styles.profilAvatar}>👤</Text>
              <Text style={styles.profilNom}>Visiteur</Text>
              <Text style={styles.profilEmail}>Non connecté</Text>
            </View>
            <TouchableOpacity style={styles.btnSuivant} onPress={() => setEcran('auth')}>
              <Text style={styles.btnSuivantText}>🔑 Se connecter</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      <NavBar />
    </View>
  );

  if (ecran === 'auth') return (
    <View style={styles.authContainer}>
      <View style={styles.authLogoRow}>
        <LogoTete />
        <Text style={styles.authLogo}>DAMA <Text style={{ color: COULEURS.orange }}>RÉER</Text></Text>
      </View>
      <Text style={styles.authSousTitre}>Ensemble, retrouvons ceux qui comptent.</Text>
      <View style={styles.authTabs}>
        <TouchableOpacity style={[styles.authTab, authMode === 'connexion' && styles.authTabActif]} onPress={() => { setAuthMode('connexion'); setAuthErreur(''); }}>
          <Text style={[styles.authTabText, authMode === 'connexion' && styles.authTabTextActif]}>Connexion</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.authTab, authMode === 'inscription' && styles.authTabActif]} onPress={() => { setAuthMode('inscription'); setAuthErreur(''); }}>
          <Text style={[styles.authTabText, authMode === 'inscription' && styles.authTabTextActif]}>Inscription</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.authForm}>
        {authMode === 'inscription' && (
          <>
            <Text style={styles.label}>Nom complet</Text>
            <TextInput style={styles.input} placeholder="Ex: Mamadou Diallo" placeholderTextColor={COULEURS.gris} value={authForm.nom} onChangeText={t => setAuthForm({ ...authForm, nom: t })} />
          </>
        )}
        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} placeholder="exemple@email.com" placeholderTextColor={COULEURS.gris} keyboardType="email-address" autoCapitalize="none" value={authForm.email} onChangeText={t => setAuthForm({ ...authForm, email: t })} />
        <Text style={styles.label}>Mot de passe</Text>
        <View style={styles.inputRow}>
          <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="••••••" placeholderTextColor={COULEURS.gris} secureTextEntry={!voirMotDePasse} value={authForm.motDePasse} onChangeText={t => setAuthForm({ ...authForm, motDePasse: t })} />
          <TouchableOpacity style={styles.btnOeil} onPress={() => setVoirMotDePasse(!voirMotDePasse)}>
            <Text style={styles.btnOeilText}>{voirMotDePasse ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        </View>
        {authErreur ? <Text style={styles.erreur}>{authErreur}</Text> : null}
        <TouchableOpacity style={styles.btnSuivant} onPress={authMode === 'connexion' ? connecter : inscrire}>
          <Text style={styles.btnSuivantText}>{authMode === 'connexion' ? '🔑 Se connecter' : "✅ S'inscrire"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 15, alignItems: 'center' }} onPress={() => setEcran('accueil')}>
          <Text style={{ color: COULEURS.gris }}>👁️ Continuer sans compte</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COULEURS.noir },
  splashContainer: { flex: 1, backgroundColor: COULEURS.noir, padding: 25, justifyContent: 'space-between', paddingTop: 60, paddingBottom: 40 },
  splashHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  splashTitre: { color: COULEURS.blanc, fontSize: 28, fontWeight: 'bold' },
  splashSousTitre: { color: COULEURS.gris, fontSize: 12, marginTop: 2 },
  splashEnfant: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  splashEmoji: { fontSize: 110 },
  splashPhrase: { fontSize: 24, color: COULEURS.blanc, textAlign: 'center', marginTop: 15, lineHeight: 34, fontWeight: 'bold' },
  splashDesc: { fontSize: 13, color: COULEURS.gris, textAlign: 'center', marginTop: 12, lineHeight: 20, paddingHorizontal: 10 },
  splashFeatures: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  splashFeatureItem: { alignItems: 'center', flex: 1 },
  splashFeatureIconContainer: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: COULEURS.orange, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  splashFeatureIcon: { fontSize: 20 },
  splashFeatureText: { color: COULEURS.gris, fontSize: 10, textAlign: 'center' },
  splashFooter: { alignItems: 'center' },
  splashFooterTitre: { color: COULEURS.orange, fontWeight: 'bold', fontSize: 12, textAlign: 'center', letterSpacing: 0.5, marginBottom: 15 },
  splashBtn: { backgroundColor: COULEURS.orange, paddingHorizontal: 40, paddingVertical: 14, borderRadius: 30 },
  splashBtnText: { color: COULEURS.blanc, fontWeight: 'bold', fontSize: 16 },
  header: { backgroundColor: COULEURS.noir, padding: 20, paddingTop: 45, borderBottomWidth: 1, borderBottomColor: COULEURS.grisClair },
  headerLogo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitre: { color: COULEURS.blanc, fontSize: 20, fontWeight: 'bold', marginTop: 5 },
  logo: { color: COULEURS.blanc, fontSize: 24, fontWeight: 'bold' },
  logoOrange: { color: COULEURS.orange, fontSize: 24, fontWeight: 'bold' },
  headerSlogan: { color: COULEURS.gris, fontSize: 10, letterSpacing: 0.5, marginTop: 2 },
  orangeText: { color: COULEURS.orange },
  retour: { color: COULEURS.orange, fontSize: 15, marginBottom: 5 },
  logoIconContainer: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  logoTete: { width: 44, height: 44, borderRadius: 22, borderWidth: 2.5, borderColor: COULEURS.orange, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(224,123,26,0.1)' },
  logoTeteEmoji: { fontSize: 22 },
  logoArc: { position: 'absolute', bottom: 0, width: 50, height: 26, borderTopWidth: 2.5, borderTopColor: COULEURS.orange, borderTopLeftRadius: 25, borderTopRightRadius: 25 },
  boutonsPrincipaux: { padding: 15, gap: 12 },
  btnSignaler: { backgroundColor: COULEURS.orange, flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, gap: 12 },
  btnVoir: { backgroundColor: COULEURS.noirCarte, flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, gap: 12, borderWidth: 1, borderColor: COULEURS.grisClair },
  btnNumeros: { backgroundColor: COULEURS.noirCarte, flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, gap: 12, borderWidth: 1, borderColor: COULEURS.grisClair },
  btnIconContainer: { width: 45, height: 45, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  btnMainIcon: { fontSize: 22 },
  btnTextContainer: { flex: 1 },
  btnMainTitre: { color: COULEURS.blanc, fontSize: 14, fontWeight: 'bold' },
  btnMainSous: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
  btnArrow: { color: COULEURS.blanc, fontSize: 24, fontWeight: 'bold' },
  statsContainer: { flexDirection: 'row', backgroundColor: COULEURS.noirCarte, margin: 15, borderRadius: 12, padding: 15, borderWidth: 1, borderColor: COULEURS.grisClair },
  statItem: { flex: 1, alignItems: 'center' },
  statNombre: { fontSize: 22, fontWeight: 'bold', color: COULEURS.orange },
  statLabel: { fontSize: 11, color: COULEURS.gris, textAlign: 'center', marginTop: 2 },
  statSeparateur: { width: 1, backgroundColor: COULEURS.grisClair },
  sectionTitre: { fontSize: 16, fontWeight: 'bold', marginLeft: 15, marginBottom: 8, color: COULEURS.blanc },
  carteAlerte: { backgroundColor: COULEURS.noirCarte, borderRadius: 12, padding: 12, marginHorizontal: 15, marginBottom: 10, flexDirection: 'row', borderWidth: 1, borderColor: COULEURS.grisClair },
  carteRetrouve: { borderColor: '#2ecc71' },
  photo: { width: 65, height: 65, borderRadius: 8, marginRight: 12 },
  carteInfo: { flex: 1 },
  carteBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 4 },
  carteBadgeText: { fontSize: 11, fontWeight: 'bold', color: COULEURS.blanc },
  badgeEnfant: { backgroundColor: '#E07B1A' },
  badgeDesoriente: { backgroundColor: '#2980b9' },
  badgeMental: { backgroundColor: '#7B2D8B' },
  badgeRetrouve: { backgroundColor: '#2ecc71' },
  carteNom: { fontSize: 14, fontWeight: 'bold', color: COULEURS.blanc },
  carteLoc: { fontSize: 12, color: COULEURS.gris, marginTop: 2 },
  carteTemps: { fontSize: 11, color: COULEURS.gris, marginTop: 2 },
  carteArrow: { color: COULEURS.orange, fontSize: 24, alignSelf: 'center' },
  rechercheContainer: { flexDirection: 'row', alignItems: 'center', margin: 15, backgroundColor: COULEURS.noirCarte, borderRadius: 10, borderWidth: 1, borderColor: COULEURS.grisClair, paddingHorizontal: 12 },
  rechercheInput: { flex: 1, padding: 12, fontSize: 14, color: COULEURS.blanc },
  rechercheIcon: { fontSize: 18 },
  filtresRow: { flexDirection: 'row', marginHorizontal: 15, marginBottom: 10, gap: 8 },
  filtrBtn: { flex: 1, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: COULEURS.grisClair, alignItems: 'center', backgroundColor: COULEURS.noirCarte },
  filtrBtnActif: { borderColor: COULEURS.orange, backgroundColor: 'rgba(224,123,26,0.15)' },
  filtrText: { color: COULEURS.gris, fontSize: 12, fontWeight: 'bold' },
  filtrTextActif: { color: COULEURS.orange },
  btnOrange: { backgroundColor: COULEURS.orange, marginBottom: 10, padding: 14, borderRadius: 10, alignItems: 'center' },
  btnOrangeText: { color: COULEURS.blanc, fontSize: 15, fontWeight: 'bold' },
  btnSuivant: { backgroundColor: COULEURS.orange, padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 15, marginBottom: 10 },
  btnSuivantText: { color: COULEURS.blanc, fontSize: 16, fontWeight: 'bold' },
  btnTransparent: { padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: COULEURS.grisClair, marginTop: 5 },
  btnTransparentText: { color: COULEURS.gris, fontSize: 15 },
  btnVert: { backgroundColor: '#2ecc71', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10, marginBottom: 15 },
  btnVertText: { color: COULEURS.blanc, fontSize: 16, fontWeight: 'bold' },
  btnWhatsApp: { backgroundColor: '#25D366', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  btnWhatsAppText: { color: COULEURS.blanc, fontSize: 16, fontWeight: 'bold' },
  btnPartageRapide: { backgroundColor: '#25D366', padding: 6, borderRadius: 6, alignItems: 'center', marginTop: 6 },
  btnPartageRapideText: { color: COULEURS.blanc, fontSize: 12, fontWeight: 'bold' },
  btnDeconnexion: { backgroundColor: '#e74c3c', margin: 15, padding: 15, borderRadius: 10, alignItems: 'center' },
  btnDeconnexionText: { color: COULEURS.blanc, fontSize: 16, fontWeight: 'bold' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  btnOeil: { backgroundColor: COULEURS.noirInput, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: COULEURS.grisClair },
  btnOeilText: { fontSize: 18 },
  navbar: { flexDirection: 'row', backgroundColor: COULEURS.noirCarte, paddingVertical: 10, paddingBottom: 20, borderTopWidth: 1, borderTopColor: COULEURS.grisClair, alignItems: 'center' },
  navItem: { flex: 1, alignItems: 'center' },
  navIcon: { fontSize: 20 },
  navLabel: { color: COULEURS.gris, fontSize: 10, marginTop: 2 },
  navLabelActif: { color: COULEURS.orange, fontWeight: 'bold' },
  navIndicateur: { width: 20, height: 2, backgroundColor: COULEURS.orange, borderRadius: 2, marginTop: 2 },
  navBtnPlus: { width: 50, height: 50, borderRadius: 25, backgroundColor: COULEURS.orange, alignItems: 'center', justifyContent: 'center', marginBottom: 10, elevation: 5 },
  navBtnPlusText: { color: COULEURS.blanc, fontSize: 28, fontWeight: 'bold', lineHeight: 32 },
  etapesContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20 },
  etapeRow: { flexDirection: 'row', alignItems: 'center' },
  etapeCercle: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: COULEURS.grisClair, alignItems: 'center', justifyContent: 'center' },
  etapeCercleActif: { borderColor: COULEURS.orange, backgroundColor: COULEURS.orange },
  etapeNum: { color: COULEURS.gris, fontWeight: 'bold' },
  etapeNumActif: { color: COULEURS.blanc },
  etapeLigne: { width: 60, height: 2, backgroundColor: COULEURS.grisClair, marginHorizontal: 5 },
  etapeLigneActif: { backgroundColor: COULEURS.orange },
  etapeTitre: { fontSize: 18, fontWeight: 'bold', color: COULEURS.blanc, marginBottom: 15 },
  typeCol: { gap: 10, marginBottom: 10 },
  typeRadio: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: COULEURS.grisClair, backgroundColor: COULEURS.noirCarte, gap: 12 },
  typeRadioActif: { borderColor: COULEURS.orange, backgroundColor: 'rgba(224,123,26,0.1)' },
  typeRadioCercle: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: COULEURS.gris },
  typeRadioCercleActif: { borderColor: COULEURS.orange, backgroundColor: COULEURS.orange },
  typeRadioText: { color: COULEURS.gris, fontSize: 14 },
  typeRadioTextActif: { color: COULEURS.blanc, fontWeight: 'bold' },
  authContainer: { flex: 1, backgroundColor: COULEURS.noir, padding: 25, justifyContent: 'center' },
  authLogoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 },
  authLogo: { color: COULEURS.blanc, fontSize: 32, fontWeight: 'bold' },
  authSousTitre: { color: COULEURS.gris, fontSize: 14, textAlign: 'center', marginBottom: 30 },
  authTabs: { flexDirection: 'row', backgroundColor: COULEURS.noirCarte, borderRadius: 10, marginBottom: 20, borderWidth: 1, borderColor: COULEURS.grisClair },
  authTab: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 10 },
  authTabActif: { backgroundColor: COULEURS.orange },
  authTabText: { color: COULEURS.gris, fontWeight: 'bold' },
  authTabTextActif: { color: COULEURS.blanc },
  authForm: { backgroundColor: COULEURS.noirCarte, borderRadius: 15, padding: 20, borderWidth: 1, borderColor: COULEURS.grisClair },
  erreur: { color: '#e74c3c', fontSize: 13, marginBottom: 10, textAlign: 'center' },
  photoDetail: { width: 120, height: 120, borderRadius: 12, alignSelf: 'center', marginBottom: 10 },
  detailNom: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', color: COULEURS.blanc, marginBottom: 4 },
  detailVues: { fontSize: 13, color: COULEURS.orange, textAlign: 'center', marginBottom: 10 },
  infoBox: { backgroundColor: COULEURS.noirCarte, borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: COULEURS.grisClair },
  infoLabel: { fontSize: 13, color: COULEURS.gris, marginBottom: 4 },
  infoValeur: { fontSize: 15, color: COULEURS.blanc },
  carte: { width: '100%', height: 200, borderRadius: 10, marginTop: 8 },
  carteForm: { width: '100%', height: 150, borderRadius: 10, marginBottom: 10 },
  messageRetrouve: { backgroundColor: 'rgba(46,204,113,0.15)', borderRadius: 10, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: '#2ecc71' },
  messageRetrouveText: { color: '#2ecc71', fontSize: 14, textAlign: 'center', fontWeight: 'bold' },
  numeroCard: { backgroundColor: COULEURS.noirCarte, borderRadius: 10, padding: 15, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COULEURS.grisClair },
  numeroIcon: { fontSize: 28, marginRight: 15 },
  numeroNom: { fontSize: 14, fontWeight: 'bold', color: COULEURS.blanc },
  numeroVal: { fontSize: 18, color: COULEURS.orange, fontWeight: 'bold' },
  profilCard: { backgroundColor: COULEURS.noirCarte, borderRadius: 15, padding: 20, alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: COULEURS.grisClair },
  profilAvatar: { fontSize: 60, marginBottom: 10 },
  profilNom: { fontSize: 20, fontWeight: 'bold', color: COULEURS.blanc },
  profilEmail: { fontSize: 14, color: COULEURS.gris },
  communauteTitre: { fontSize: 16, fontWeight: 'bold', color: COULEURS.blanc, marginBottom: 8 },
  communauteTexte: { fontSize: 14, color: COULEURS.gris, lineHeight: 22 },
  confirmationContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  confirmationCercle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#2ecc71', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  confirmationCheck: { fontSize: 50, color: COULEURS.blanc, fontWeight: 'bold' },
  confirmationTitre: { fontSize: 26, fontWeight: 'bold', color: COULEURS.blanc, marginBottom: 10 },
  confirmationTexte: { fontSize: 15, color: COULEURS.gris, textAlign: 'center', marginBottom: 30, lineHeight: 22 },
  label: { fontSize: 13, color: COULEURS.gris, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: COULEURS.noirInput, borderRadius: 8, padding: 12, fontSize: 14, borderWidth: 1, borderColor: COULEURS.grisClair, color: COULEURS.blanc, marginBottom: 5 },
  photoContainer: { marginBottom: 10 },
  photoPreview: { width: '100%', height: 200, borderRadius: 10 },
  photoPlaceholder: { backgroundColor: COULEURS.noirInput, borderRadius: 10, borderWidth: 1, borderColor: COULEURS.grisClair, borderStyle: 'dashed', height: 130, alignItems: 'center', justifyContent: 'center' },
});