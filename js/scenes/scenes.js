const ensureDeskLink = () => {
   const header = document.getElementById("header");
   if (!header || !header.innerHTML.includes(">PLEASE HOLD<")) return;
   if (document.getElementById("wwo-desk-link")) return;
   const a = document.createElement("a");
   a.id = "wwo-desk-link";
   a.href = "/js/scenes/MazeRunner/desk.html";
   a.target = "_blank";
   a.rel = "noopener";
   a.textContent = "PLEASE HOLD Desk";
   a.style.margin = "0 8px";
   a.style.fontWeight = "700";
   header.appendChild(a);
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
            { name: "PLEASE HOLD" , path: "./MazeRunner/game.js", public: true },
      ]
   };
}
