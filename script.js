const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');

menuToggle?.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('.main-nav a').forEach((link) => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  });
});

if (window.gsap && window.ScrollTrigger) {
  document.documentElement.classList.add('gsap-ready');
  gsap.registerPlugin(ScrollTrigger);
  gsap.utils.toArray('.reveal').forEach((element) => {
    gsap.to(element, {
      y: 0,
      opacity: 1,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: element, start: 'top 86%', once: true }
    });
  });
  gsap.from('.hero-image-wrap', { scale: 1.08, duration: 1.4, ease: 'power3.out' });
  gsap.from('.hero-stamp', { rotation: 18, opacity: 0, duration: 1.2, delay: .4, ease: 'back.out(1.5)' });
}
