function getRandomHex() {
  var letters = "0123456789ABCDEF";
  var color = "";
  for (var i = 0; i < 6; i++) color += letters[Math.floor(Math.random() * 16)];
  return color;
}

particlesJS("particles-js", {
  particles: {
    number: {
      value: 520,
      density: {
        enable: true,
        value_area: 1000,
      },
    },
    color: {
      value: ["#565656", "#606060", "#4e4e4e", "#6a6a6a", "#484848"],
    },
    shape: {
      type: "circle",
      stroke: {
        width: 0,
        color: "0",
      },
      polygon: {
        nb_sides: 8,
      },
      image: {
        src: "img/github.svg",
        width: 100,
        height: 100,
      },
    },
    opacity: {
      value: 1,
      random: false,
      anim: {
        enable: false,
        speed: 3,
        opacity_min: 0.1,
        sync: false,
      },
    },
    size: {
      value: 1.5,
      random: true,
      anim: {
        enable: false,
        speed: 40,
        size_min: 0.1,
        sync: false,
      },
    },
    line_linked: {
      enable: true,
      distance: 100,
      color: "#4a4a4a",
      opacity: 0.5,
      width: 1,
    },
    move: {
      enable: true,
      speed: 4,
      direction: "none",
      random: true,
      straight: false,
      out_mode: "out",
      attract: {
        enable: true,
        rotateX: 600,
        rotateY: 1200,
      },
    },
  },
  interactivity: {
    detect_on: "window",
    events: {
      onhover: {
        enable: true,
        mode: "repulse",
      },
      onclick: {
        enable: false,
        mode: "bubble",
      },
      resize: true,
    },
    modes: {
      grab: {
        distance: 300,
        line_linked: {
          opacity: 1,
        },
      },
      bubble: {
        distance: 320,
        size: 2.5,
        duration: 0.3,
        opacity: 1,
        speed: 10,
      },
      repulse: {
        distance: 100,
      },
      push: {
        particles_nb: 4,
      },
      remove: {
        particles_nb: 2,
      },
    },
  },
  retina_detect: true,
  
});
