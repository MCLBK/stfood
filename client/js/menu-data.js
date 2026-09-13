/* ============================================================
   DONNÉES DU MENU — REPLI HORS-LIGNE
   La source de vérité est maintenant la base de données du serveur
   (voir server/scripts/seed.js et le panneau /admin). Ce fichier ne
   sert que de repli si l'API est injoignable, pour que le site reste
   consultable. Il est tenu en miroir du seed — si tu ajoutes un plat
   côté serveur/admin, tu peux (optionnel) le dupliquer ici.
   ============================================================ */
const MENU_DATA = {
  categories: [
    { id:'spaghettis',  label:'Spaghettis',   emoji:'🍝' },
    { id:'coquillettes',label:'Coquillettes', emoji:'🥣' },
    { id:'shawarma',    label:'Shawarma',     emoji:'🌯' },
    { id:'sautes',      label:'Sautés',       emoji:'🍖' },
    { id:'boissons',    label:'Boissons',     emoji:'🥤' },
  ],
  dishes: [
    { id:'sp-lifestyle', cat:'spaghettis', name:'Spaghetti Lifestyle', desc:'Sauce crème, légumes, saucisses, oeufs, sardines.', photo:'assets/images/dish-spaghetti-1.jpg', xl:2500, xxl:3000, spicyToggle:true, viandeOption:true },
    { id:'sp-crazy', cat:'spaghettis', name:'Spaghetti Crazy Vibes', desc:'Rouge ou blanc, légumes, saucisses, oeufs, sardines.', photo:'assets/images/dish-spaghetti-2.jpg', xl:2000, xxl:2500, spicyToggle:true, viandeOption:true, colorOption:true },
    { id:'sp-good', cat:'spaghettis', name:'Spaghetti Good Vibes', desc:'Rouge ou blanc, saucisses, oeufs.', photo:'assets/images/dish-spaghetti-1.jpg', xl:1500, xxl:2000, spicyToggle:true, viandeOption:true, colorOption:true },

    { id:'co-lifestyle', cat:'coquillettes', name:'Coquillettes Lifestyle', desc:'Sauce crème, légumes, saucisses, oeufs, sardines.', photo:'assets/images/dish-bowls.jpg', xl:2500, xxl:3000, spicyToggle:true, viandeOption:true },
    { id:'co-crazy', cat:'coquillettes', name:'Coquillettes Crazy Vibes', desc:'Rouge ou blanc, légumes, saucisses, oeufs, sardines.', photo:'assets/images/dish-bowls.jpg', xl:2000, xxl:2500, spicyToggle:true, viandeOption:true, colorOption:true },
    { id:'co-good', cat:'coquillettes', name:'Coquillettes Good Vibes', desc:'Rouge ou blanc, saucisses, oeufs.', photo:'assets/images/dish-bowls.jpg', xl:1500, xxl:2000, spicyToggle:true, viandeOption:true, colorOption:true },

    { id:'sh-poulet', cat:'shawarma', name:'Shawarma poulet', desc:'Bientôt sur le menu digital.', photo:'assets/images/interior-wall.jpg', soon:true },
    { id:'sa-viande', cat:'sautes', name:'Sauté de viande', desc:'Bientôt sur le menu digital.', photo:'assets/images/interior-wall.jpg', soon:true },

    { id:'bo-girafe', cat:'boissons', name:'Girafe bière pression', desc:'Grand format à partager (tour ~3L) — idéal pour un groupe.', price:6000, simple:true },
    { id:'bo-pression', cat:'boissons', name:'Verre de pression', desc:'Bière pression au verre.', price:2000, simple:true },
    { id:'bo-biere', cat:'boissons', name:'Bière', desc:'Au choix selon disponibilité.', price:1000, simple:true, variants:['Desperados','Sombreros','Béninoise','Beaufort','Kankpe','Chill','Legend'] },
    { id:'bo-soda', cat:'boissons', name:'Soda', desc:'Au choix selon disponibilité.', price:1000, simple:true, variants:['Fanta','Coca','Sprite','Youzou','Pompom','Star Citron','Youki','Pamplemousse','Malta Guiness','Moka'] },
    { id:'bo-energy', cat:'boissons', name:'Energy drink', desc:'Au choix selon disponibilité.', price:1500, simple:true, variants:['XXL','Rox','Monster','Red Bull','Vody'] },
    { id:'bo-street', cat:'boissons', name:'Street drink', desc:'Fait maison.', price:1000, simple:true, variants:['Bissap','Lait caillé'] },
    { id:'bo-eau-fifa', cat:'boissons', name:'Eau Fifa 1,5L', desc:'', price:1000, simple:true },
    { id:'bo-eau-comtesse-citron', cat:'boissons', name:'Eau Comtesse Citron 1,25L', desc:'', price:1000, simple:true },
    { id:'bo-eau-comtesse-planete', cat:'boissons', name:'Eau Comtesse Planète 1L', desc:'', price:1000, simple:true },
    { id:'bo-eau-possotome', cat:'boissons', name:'Eau Possotome Gazéifié 1L', desc:'Gazéifiée.', price:1000, simple:true },
    { id:'bo-eau-aquabelle', cat:'boissons', name:'Eau Aquabelle 0,5L', desc:'Petit format.', price:500, simple:true },
  ]
};

const SPECIAL_DISH = { id:'special-riz-mouton', name:'Riz blanc + sauce mouton (Samedi dès 23h59)', xl:2500, xxl:3000, photo:'assets/images/promo-riz-mouton.jpg' };
