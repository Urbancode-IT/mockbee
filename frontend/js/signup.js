document.addEventListener('DOMContentLoaded', () => {

    // Elements
    const signupForm = document.querySelector('.auth-form');
    const errorMsg = document.getElementById('signup-error-msg');
    const errorText = document.getElementById('error-text');
    const inputs = document.querySelectorAll('.form-input');
    
    // 0. Simulated Social OAuth Clicks for Signup
    const socialIcons = document.querySelectorAll('.social-icon');
    socialIcons.forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.preventDefault();
            const titleAttr = icon.getAttribute('title') || '';
            const provider = titleAttr.replace('Sign in with ', '');
            if (!provider || provider === '') return;

            let oauthEmail = prompt(`Enter the email for your ${provider} account:`) || '';
            oauthEmail = oauthEmail.trim().toLowerCase();
            if (!oauthEmail || !oauthEmail.includes('@')) {
                alert('A valid email is required to continue.');
                return;
            }
            const defaultName = oauthEmail.split('@')[0] || `${provider} User`;
            const oauthName = prompt(`Enter your ${provider} account name:`, defaultName) || defaultName;

            fetch(`${API_BASE}/api/oauth-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, email: oauthEmail, name: oauthName })
            })
            .then(res => res.json())
            .then(regData => {
                if (regData.status === 'success') {
                    localStorage.setItem('mockbee_user_name', regData.name || oauthName);
                    localStorage.setItem('mockbee_user_email', regData.email || oauthEmail);
                    localStorage.setItem('mockbee_role', regData.role || 'PUBLIC');
                    localStorage.setItem('mockbee_is_student', regData.is_student ? 'true' : 'false');
                    if (regData.is_student) {
                        localStorage.setItem('mockbee_subscribed', 'true');
                        localStorage.setItem('mockbee_subscribed_plan', 'student_access');
                    } else {
                        localStorage.setItem('mockbee_subscribed', 'false');
                    }
                    
                    if (!regData.is_student) localStorage.removeItem('mockbee_subscribed_plan');
                    localStorage.removeItem('mockbee_all_plans');
                    localStorage.removeItem('mockbee_interviews');
                    localStorage.removeItem('mockbee_activities');

                    window.location.href = 'dashboard.html';
                } else {
                    alert(regData.detail || `Failed to continue with ${provider}.`);
                }
            }).catch(err => {
                localStorage.setItem('mockbee_user_name', oauthName);
                localStorage.setItem('mockbee_user_email', oauthEmail);
                window.location.href = 'dashboard.html';
            });
        });
    });

    // 1. Password Visibility Toggle
    const setupPasswordToggle = (toggleId, inputId) => {
        const toggleBtn = document.getElementById(toggleId);
        const passwordInput = document.getElementById(inputId);

        if (toggleBtn && passwordInput) {
            toggleBtn.addEventListener('click', () => {
                const isPassword = passwordInput.getAttribute('type') === 'password';
                passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
                toggleBtn.classList.toggle('fa-eye');
                toggleBtn.classList.toggle('fa-eye-slash');
            });
        }
    };

    setupPasswordToggle('togglePassword', 'password');
    setupPasswordToggle('toggleConfirmPassword', 'confirm-password');

    // 2. Error Display Helpers
    const showSignupError = (message) => {
        if (errorMsg && errorText) {
            errorText.textContent = message;
            errorMsg.style.display = 'flex';
        }
    };

    const hideSignupError = () => {
        if (errorMsg) {
            errorMsg.style.display = 'none';
        }
    };

    // Clear error while typing
    inputs.forEach(input => {
        input.addEventListener('input', hideSignupError);
    });

    // Clear error when checkbox toggled
    const termsCheck = document.getElementById('agreeTerms');
    if (termsCheck) {
        termsCheck.addEventListener('change', hideSignupError);
    }

    // 3. Validation & Registration
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const fullname = (document.getElementById('fullname')?.value || '').trim();
            const emailRaw = (document.getElementById('email')?.value || '').trim();
            const pass = document.getElementById('password')?.value || '';
            const confirm = document.getElementById('confirm-password')?.value || '';
            const terms = document.getElementById('agreeTerms')?.checked;

            // --- Full Validation Logic ---
            // Strict Regex: requires @ and a TLD of at least 2 characters
            const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

            if (!fullname || !emailRaw || !pass) {
                showSignupError('Please fill in all required fields.');
                return;
            }

            if (!emailRegex.test(emailRaw)) {
                showSignupError('Please enter a valid email address.');
                return;
            }

            if (pass.length < 6) {
                showSignupError('Password must be at least 6 characters.');
                return;
            }

            if (pass !== confirm) {
                showSignupError('Passwords do not match.');
                return;
            }

            if (!terms) {
                showSignupError('Please agree to the Terms & Privacy.');
                return;
            }

            // Normalise email for storage
            const email = emailRaw.toLowerCase();

            // Setup API call to FastAPI backend
            fetch(`${API_BASE}/api/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: fullname, email: email, password: pass })
            })
            .then(response => response.json().then(data => ({ status: response.status, body: data })))
            .then(res => {
                if (res.status === 400) {
                    showSignupError(res.body.detail || 'Signup failed.');
                    return;
                } else if (res.status !== 200) {
                    showSignupError('Server error, try again later.');
                    return;
                }

                // --- Success Phase ---
                // Set session
                localStorage.setItem('mockbee_user_name', fullname);
                localStorage.setItem('mockbee_user_email', email);
                localStorage.setItem('mockbee_role', 'PUBLIC');
                localStorage.setItem('mockbee_is_student', 'false');
                localStorage.setItem('mockbee_subscribed', 'false');
                localStorage.setItem('mockbee_send_welcome_email', 'true'); // Flag for welcome email
                
                // Ensure all stale user data is cleared for the new session
                localStorage.removeItem('mockbee_subscribed_plan');
                localStorage.removeItem('mockbee_all_plans');
                localStorage.removeItem('mockbee_sub_start_date');
                localStorage.removeItem('mockbee_sub_end_date');
                localStorage.removeItem('mockbee_sub_billing');
                localStorage.removeItem('mockbee_interviews');
                localStorage.removeItem('mockbee_activities');
                localStorage.removeItem('mockbee_badges');
                localStorage.removeItem('mockbee_notifications');
                localStorage.removeItem('mockbee_notif_unread');
                localStorage.removeItem('mockbee_subscription_expiry');

                // Redirect with rocket animation effect if possible
                window.location.href = 'dashboard.html?source=new_user';
            })
            .catch(err => {
                console.error(err);
                // Backend unreachable — save account locally so user can proceed
                const accounts = JSON.parse(localStorage.getItem('mockbee_accounts') || '{}');
                if (accounts[email]) {
                    showSignupError('An account with this email already exists. Please log in.');
                    return;
                }
                // Save locally (will sync to DB on next backend connection)
                accounts[email] = { name: fullname, password: pass, subscribed: false };
                localStorage.setItem('mockbee_accounts', JSON.stringify(accounts));
                localStorage.setItem('mockbee_user_name', fullname);
                localStorage.setItem('mockbee_user_email', email);
                localStorage.setItem('mockbee_role', 'PUBLIC');
                localStorage.setItem('mockbee_is_student', 'false');
                localStorage.setItem('mockbee_subscribed', 'false');
                localStorage.setItem('mockbee_send_welcome_email', 'true');
                localStorage.removeItem('mockbee_subscribed_plan');
                localStorage.removeItem('mockbee_all_plans');
                localStorage.removeItem('mockbee_interviews');
                localStorage.removeItem('mockbee_activities');
                window.location.href = 'dashboard.html?source=new_user';
            });
        });
    }
});
