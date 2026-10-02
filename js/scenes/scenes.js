const ensureDeskLink = () => {
   const header = document.getElementById("header");
   if (!header) return;
   const sceneBtn = [...header.querySelectorAll("button")].find(b => b.textContent.trim() === "PLEASE HOLD");
   if (!sceneBtn) return;
   sceneBtn.onclick = () => {
      window.chooseFlag("PLEASE HOLD");
      if (window.syncDemos) window.syncDemos();
   };
   if (document.getElementById("wwo-desk-link")) return;
   const desk = document.createElement("button");
   desk.id = "wwo-desk-link";
   desk.type = "button";
   desk.textContent = "PLEASE HOLD Desk";
   desk.onclick = () => window.open("/js/scenes/PLEASEHOLD/desk.html", "_blank", "noopener");
   sceneBtn.insertAdjacentElement("afterend", desk);
};

const watchHeader = () => {
   const header = document.getElementById("header");
   if (!header) {
      setTimeout(watchHeader, 200);
      return;
   }
   new MutationObserver(ensureDeskLink).observe(header, { childList: true, subtree: true });
   ensureDeskLink();
};
watchHeader();

export default () => {
   return {
      enableSceneReloading: true,
      scenes: [ 
            { name: "simple"   , path: "./simple.js"   , public: true },
            { name: "shapes"   , path: "./shapes.js"   , public: true },
            { name: "jointed"  , path: "./jointed.js"  , public: true },
            { name: "interact" , path: "./interact.js" , public: true },
            { name: "beam"     , path: "./beam.js"     , public: true },
            { name: "HPWand"   , path: "./HPWand.js"   , public: true },
            { name: "PLEASE HOLD" , path: "./PLEASEHOLD/game.js", public: true },
      ]
   };
}
