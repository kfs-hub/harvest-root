/**
 * Auth0 Configuration & Client Initialization
 */

// Auth0 credentials (from Render environment variables)
const AUTH0_DOMAIN = 'dev-mqhyf0wtkytr83ys.us.auth0.com';
const AUTH0_CLIENT_ID = 'qFcV16FaCjfgAkbqTEqTeu6sKdgmSQyh';

// Determine redirect URI based on environment
const AUTH0_REDIRECT_URI = window.location.origin;

let auth0Client = null;

/**
 * Initialize Auth0 SDK
 */
async function initializeAuth0() {
    try {
        auth0Client = await auth0.createAuth0Client({
            domain: AUTH0_DOMAIN,
            clientId: AUTH0_CLIENT_ID,
            authorizationParams: {
                redirect_uri: AUTH0_REDIRECT_URI,
            },
        });

        // Handle the redirect back from Auth0 (callback after login)
        if (location.search.includes('code=') && location.search.includes('state=')) {
            await auth0Client.handleRedirectCallback();
            window.history.replaceState({}, '', '/');
        }

        // Check if user is authenticated and update UI
        await updateUserUI();
    } catch (err) {
        console.error('Auth0 initialization failed:', err);
    }
}

/**
 * Update navbar with user info or login button
 */
async function updateUserUI() {
    const isAuthenticated = await auth0Client.isAuthenticated();
    const userBtn = document.getElementById('user-btn');
    const userBadge = document.getElementById('user-name-badge');

    if (isAuthenticated) {
        const user = await auth0Client.getUser();
        
        // Store user info in localStorage for later use
        localStorage.setItem('auth0_user', JSON.stringify(user));
        localStorage.setItem('auth0_token', await auth0Client.getTokenSilently());

        // Update navbar to show user email
        if (userBadge && user.email) {
            userBadge.textContent = user.email.split('@')[0]; // Show just the part before @
            userBadge.style.display = 'inline';
            userBtn.title = user.email;
        }

        // Add logout option to user button
        userBtn.onclick = showUserMenu;
    } else {
        // Show login button
        if (userBadge) {
            userBadge.style.display = 'none';
        }
        userBtn.onclick = loginWithAuth0;
        userBtn.style.cursor = 'pointer';
    }
}

/**
 * Login with Auth0
 */
async function loginWithAuth0() {
    try {
        await auth0Client.loginWithRedirect({
            authorizationParams: {
                screen_hint: 'login',
            },
        });
    } catch (err) {
        console.error('Login failed:', err);
    }
}

/**
 * Signup with Auth0
 */
async function signupWithAuth0() {
    try {
        await auth0Client.loginWithRedirect({
            authorizationParams: {
                screen_hint: 'signup',
            },
        });
    } catch (err) {
        console.error('Signup failed:', err);
    }
}

/**
 * Logout
 */
async function logout() {
    try {
        localStorage.removeItem('auth0_user');
        localStorage.removeItem('auth0_token');
        
        await auth0Client.logout({
            logoutParams: {
                returnTo: window.location.origin,
            },
        });
    } catch (err) {
        console.error('Logout failed:', err);
    }
}

/**
 * Show user menu (profile/logout)
 */
function showUserMenu() {
    const menu = document.getElementById('user-menu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

/**
 * Get current Auth0 token (for API calls)
 */
async function getAuthToken() {
    if (!auth0Client) return null;
    try {
        return await auth0Client.getTokenSilently();
    } catch (err) {
        console.error('Failed to get token:', err);
        return null;
    }
}

/**
 * Check if user is authenticated
 */
async function isUserAuthenticated() {
    if (!auth0Client) return false;
    return await auth0Client.isAuthenticated();
}

/**
 * Get current user data
 */
async function getCurrentUser() {
    if (!auth0Client) return null;
    if (await auth0Client.isAuthenticated()) {
        return await auth0Client.getUser();
    }
    return null;
}

/**
 * Show user profile page
 */
async function showProfilePage() {
    const user = await getCurrentUser();
    if (!user) {
        alert('Please log in first.');
        return;
    }

    const profileContent = `
        <div style="padding: 2rem; max-width: 500px;">
            <h2 style="color: #2d5a3d; margin-bottom: 1.5rem;">Your Profile</h2>
            
            <div style="background: #fdfcf7; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem;">
                <div style="margin-bottom: 1rem;">
                    <strong style="color: #554a42; display: block; margin-bottom: 0.25rem;">Email:</strong>
                    <span style="color: #8c7e6c;">${user.email || 'N/A'}</span>
                </div>
                
                <div style="margin-bottom: 1rem;">
                    <strong style="color: #554a42; display: block; margin-bottom: 0.25rem;">Name:</strong>
                    <span style="color: #8c7e6c;">${user.name || user.nickname || 'N/A'}</span>
                </div>
                
                <div>
                    <strong style="color: #554a42; display: block; margin-bottom: 0.25rem;">Email Verified:</strong>
                    <span style="color: #8c7e6c;">${user.email_verified ? '✓ Yes' : '✗ No'}</span>
                </div>
            </div>

            <div style="text-align: center;">
                <button onclick="closeProfileModal()" style="
                    padding: 0.75rem 1.5rem;
                    background: #2d5a3d;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.9rem;
                ">Close</button>
            </div>
        </div>
    `;

    const modal = document.createElement('div');
    modal.id = 'profile-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
    `;
    modal.innerHTML = `<div style="background: white; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.2);">${profileContent}</div>`;
    modal.onclick = (e) => {
        if (e.target === modal) closeProfileModal();
    };
    
    document.body.appendChild(modal);
}

/**
 * Close profile modal
 */
function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (modal) {
        modal.remove();
    }
    // Close user menu too
    const menu = document.getElementById('user-menu');
    if (menu) {
        menu.style.display = 'none';
    }
}

// Initialize Auth0 when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAuth0);
} else {
    initializeAuth0();
}
