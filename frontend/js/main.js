/* ============================================
   MockBee - Main JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ---- Auth State Management (Nav Bar) ---- */
  const userName = localStorage.getItem('mockbee_user_name');
  const userEmail = localStorage.getItem('mockbee_user_email');
  const userPicture = localStorage.getItem('mockbee_user_picture'); // If from Google Auth
  
  if (userName || userEmail) {
    // User is signed in!
    const navLogin = document.getElementById('nav-login');
    const navSignup = document.getElementById('nav-signup');
    const navUserAvatar = document.getElementById('nav-user-avatar');
    const navUserInitial = document.getElementById('nav-user-initial');
    
    const navUserWrap = document.getElementById('nav-user-wrap');
    
    const mobLogin = document.getElementById('mobile-nav-login');
    const mobSignup = document.getElementById('mobile-nav-signup');
    const mobDashboard = document.getElementById('mobile-nav-dashboard');

    if (navLogin) navLogin.style.display = 'none';
    if (navSignup) navSignup.style.display = 'none';
    if (mobLogin) mobLogin.style.display = 'none';
    if (mobSignup) mobSignup.style.display = 'none';
    
    if (mobDashboard) mobDashboard.style.display = 'block';
    
    if (navUserWrap && navUserAvatar) {
      navUserWrap.style.display = 'block';
      navUserAvatar.style.display = 'flex'; // Use flex for centering child
      // Create initial
      let identifier = userName || userEmail;
      let initial = identifier.charAt(0).toUpperCase();
      
      if (userPicture) {
         navUserAvatar.innerHTML = `<img src="${userPicture}" alt="Profile" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
      } else {
         if (navUserInitial) navUserInitial.innerText = initial;
      }
      
      // Dropdown Toggle Logic
      const dropdown = document.getElementById('nav-user-dropdown');
      navUserAvatar.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
      });
      
      // Close dropdown when clicking outside
      window.addEventListener('click', (e) => {
          if (!navUserWrap.contains(e.target) && dropdown.style.display === 'block') {
              dropdown.style.display = 'none';
          }
      });
      
      // Logout Logic matching MockBee structure
      const navLogoutBtn = document.getElementById('nav-logout-btn');
      if (navLogoutBtn) {
          navLogoutBtn.addEventListener('click', () => {
              // Same cleanup routine as Dashboard
              const email = localStorage.getItem('mockbee_user_email') || '';
              const name = localStorage.getItem('mockbee_user_name') || '';
              const subscribed = localStorage.getItem('mockbee_subscribed') === 'true';

              if (email) {
                  const accounts = JSON.parse(localStorage.getItem('mockbee_accounts') || '{}');
                  if (accounts[email]) {
                      accounts[email].name = name;
                      accounts[email].subscribed = subscribed;
                      accounts[email].interviews = JSON.parse(localStorage.getItem('mockbee_interviews') || '[]');
                      accounts[email].activities = JSON.parse(localStorage.getItem('mockbee_activities') || '[]');
                      localStorage.setItem('mockbee_accounts', JSON.stringify(accounts));
                  }
              }

              localStorage.removeItem('mockbee_user_name');
              localStorage.removeItem('mockbee_user_email');
              localStorage.removeItem('mockbee_role');
              localStorage.removeItem('mockbee_is_student');
              localStorage.removeItem('mockbee_admin_token');
              localStorage.removeItem('mockbee_subscribed');
              localStorage.removeItem('mockbee_interviews');
              localStorage.removeItem('mockbee_activities');
              
              window.location.reload(); // Refresh unauthenticates the Nav!
          });
      }
    }
  }

  /* ---- Scroll Reveal Animation ---- */
  const fadeEls = document.querySelectorAll('.fade-in-up, .fade-in-right');

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        // Staggered delay for card groups
        const delay = entry.target.dataset.delay || 0;
        setTimeout(() => {
          entry.target.classList.add('visible');
        }, delay);
        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -30px 0px'
  });

  fadeEls.forEach(el => revealObserver.observe(el));


  /* ---- Smooth Scroll for nav links ---- */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });


  /* ---- Navbar scroll effect toggle ---- */
  const navbar = document.querySelector('.navbar');
  const hamburger = document.getElementById('hamburger-menu');
  const navLinksContainer = document.getElementById('nav-links');

  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      navbar.classList.add('navbar--scrolled');
    } else {
      navbar.classList.remove('navbar--scrolled');
    }
  });

  if (hamburger && navLinksContainer) {
    hamburger.addEventListener('click', () => {
      navLinksContainer.classList.toggle('active');
      const icon = hamburger.querySelector('i');
      if (navLinksContainer.classList.contains('active')) {
        icon.classList.replace('fa-bars', 'fa-times');
      } else {
        icon.classList.replace('fa-times', 'fa-bars');
      }
    });

    // Close menu when a link is clicked
    navLinksContainer.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinksContainer.classList.remove('active');
        hamburger.querySelector('i').classList.replace('fa-times', 'fa-bars');
      });
    });
  }


  /* ---- Button Click Ripple ---- */
  document.querySelectorAll('.btn-primary, .btn-secondary, .btn-signup').forEach(btn => {
    btn.addEventListener('click', function (e) {
      const rect = this.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.style.cssText = `
        position: absolute;
        border-radius: 50%;
        width: 6px;
        height: 6px;
        background: rgba(255,255,255,0.45);
        transform: scale(0);
        animation: rippleAnim 0.6s ease-out;
        top: ${e.clientY - rect.top - 3}px;
        left: ${e.clientX - rect.left - 3}px;
        pointer-events: none;
      `;
      this.style.position = 'relative';
      this.style.overflow = 'hidden';
      this.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  });

  /* Add ripple keyframe if not present */
  if (!document.getElementById('ripple-style')) {
    const style = document.createElement('style');
    style.id = 'ripple-style';
    style.textContent = `
      @keyframes rippleAnim {
        to { transform: scale(40); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }


  /* ---- Bee parallax on mouse move ---- */
  const beeImg = document.querySelector('.hero__bee-img');
  const hero = document.querySelector('.hero');

  if (beeImg && hero) {
    hero.addEventListener('mousemove', (e) => {
      const rect = hero.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const dx = (e.clientX - rect.left - cx) / cx;
      const dy = (e.clientY - rect.top - cy) / cy;
      beeImg.style.transform = `translate(${dx * 10}px, ${dy * 8}px)`;
    });

    hero.addEventListener('mouseleave', () => {
      beeImg.style.transform = '';
    });
  }


  /* ---- Premium Roles Filtering: Staggered Reveal ---- */
  const filterButtons = document.querySelectorAll('.filter-btn');
  const roleCards = document.querySelectorAll('.role-card');

  filterButtons.forEach(button => {
    button.addEventListener('click', () => {
      if (button.classList.contains('active')) return;

      // 1. Update active button
      filterButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      const filterValue = button.getAttribute('data-filter');

      // 2. Initial Collapse (Fade Out All)
      roleCards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px) scale(0.95)';
        card.classList.remove('anim-in');
      });

      // 3. Re-flow & Staggered Reveal
      setTimeout(() => {
        let visibleCount = 0;
        roleCards.forEach((card) => {
          const cardCategory = card.getAttribute('data-category') || '';
          const shouldShow = (filterValue === 'all' || cardCategory.includes(filterValue));

          if (shouldShow) {
            card.style.display = 'flex';
            // Staggered reveal effect
            setTimeout(() => {
              card.classList.add('anim-in');
            }, visibleCount * 80); // 80ms delay between cards
            visibleCount++;
          } else {
            card.style.display = 'none';
          }
        });
      }, 350); // Matches the visual fade duration
    });
  });

  /* ---- Typewriter Effect for Hero Title (Come/Go Back Animation) ---- */
  const heroTitle = document.getElementById('hero-heading');
  if (heroTitle) {
    const staticText = "Ace Your ";
    const dynamicText = "Next Job Interview";
    let isDeleting = false;
    let charIndex = dynamicText.length; // Start fully visible

    function typeWriter() {
      // Create the dynamic text slice
      const currentText = dynamicText.substring(0, charIndex);

      // Inject the static text base with the animating text slice and a styled gold blinking cursor
      heroTitle.innerHTML = staticText + currentText + '<span class="type-cursor" style="display:inline-block; width:5px; height:0.95em; background-color:var(--gold); vertical-align:text-bottom; margin-left:4px; border-radius:2px; animation: blinkCursor 0.8s step-end infinite;"></span>';

      let typeSpeed = isDeleting ? 40 : 80; // Speed of typing vs deleting

      if (!isDeleting && charIndex === dynamicText.length) {
        // Pause at the full text before deleting goes back
        typeSpeed = 4000;
        isDeleting = true;
      } else if (isDeleting && charIndex === 0) {
        // Pause at the beginning before typing again
        typeSpeed = 1000;
        isDeleting = false;
      }

      charIndex += isDeleting ? -1 : 1;
      setTimeout(typeWriter, typeSpeed);
    }

    // Add CSS for the blinking cursor dynamically
    if (!document.getElementById('cursor-style')) {
      const style = document.createElement('style');
      style.id = 'cursor-style';
      style.textContent = `@keyframes blinkCursor { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`;
      document.head.appendChild(style);
    }

    // Delay the start so the original entrance animation can complete gracefully
    setTimeout(typeWriter, 2500);
  }

  /* ---- Add New Role Modal Logic ---- */
  const addRoleCard = document.getElementById('add-role-card');
  const roleModal = document.getElementById('roleModal');
  const closeModal = document.getElementById('closeModal');
  const submitRoleBtn = document.getElementById('submitRoleBtn');
  const customRoleInput = document.getElementById('customRoleInput');
  const modalMessage = document.getElementById('modalMessage');

  if (addRoleCard && roleModal && closeModal) {
    // Open modal
    addRoleCard.addEventListener('click', () => {
      roleModal.classList.add('active');
      customRoleInput.value = '';
      modalMessage.style.display = 'none';
      customRoleInput.focus();
    });

    // Close modal (X button)
    closeModal.addEventListener('click', () => {
      roleModal.classList.remove('active');
    });

    // Close modal (Clicking outside)
    window.addEventListener('click', (e) => {
      if (e.target === roleModal) {
        roleModal.classList.remove('active');
      }
    });

    // Submit Logic
    if (submitRoleBtn) {
      submitRoleBtn.addEventListener('click', () => {
        const roleName = customRoleInput.value.trim();
        if (roleName) {
          // Save to localStorage
          let customRequests = JSON.parse(localStorage.getItem('mockbee_custom_roles') || '[]');
          customRequests.push({
            role: roleName,
            timestamp: new Date().toISOString()
          });
          localStorage.setItem('mockbee_custom_roles', JSON.stringify(customRequests));

          // Success Feedback
          modalMessage.textContent = `Success! Your request for "${roleName}" has been saved.`;
          modalMessage.style.display = 'block';
          customRoleInput.value = '';

          // Close modal after a short delay
          setTimeout(() => {
            roleModal.classList.remove('active');
          }, 2000);
        } else {
          alert('Please enter a role name!');
        }
      });
    }

    // Allow Enter key to submit
    customRoleInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        submitRoleBtn.click();
      }
    });
  }

});

/* ---- Professional System Wipe (One-Time Factory Reset) ---- */
(function () {
  if (localStorage.getItem('sys_wipe_done') !== 'true') {
    const keys = Object.keys(localStorage).filter(key =>
      key.startsWith('mockbee_') || key === 'recentInterview'
    );
    keys.forEach(key => localStorage.removeItem(key));
    localStorage.setItem('sys_wipe_done', 'true');
    console.warn('[MockBee System] ALERT: All accounts and session data have been wiped.');
  }
})();
