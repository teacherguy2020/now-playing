(function () {
      const isStandalone =
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        (window.navigator && window.navigator.standalone);

      document.documentElement.classList.toggle('standalone', !!isStandalone);
    })();
