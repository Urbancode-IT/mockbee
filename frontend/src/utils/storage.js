export const KEYS = {
  userName: 'mockbee_user_name',
  userEmail: 'mockbee_user_email',
  userPicture: 'mockbee_user_picture',
  role: 'mockbee_role',
  isStudent: 'mockbee_is_student',
  isAdmin: 'mockbee_is_admin',
  adminToken: 'mockbee_admin_token',
  subscribed: 'mockbee_subscribed',
  subscribedPlan: 'mockbee_subscribed_plan',
  allPlans: 'mockbee_all_plans',
  subStartDate: 'mockbee_sub_start_date',
  subEndDate: 'mockbee_sub_end_date',
  subBilling: 'mockbee_sub_billing',
  accounts: 'mockbee_accounts',
  interviews: 'mockbee_interviews',
  recentInterview: 'recentInterview',
  activities: 'mockbee_activities',
  badges: 'mockbee_badges',
  notifications: 'mockbee_notifications',
  notifUnread: 'mockbee_notif_unread',
  selectedRole: 'mockbee_selected_role',
  lastPage: 'mockbee_last_page',
  customRoles: 'mockbee_custom_roles',
  sendWelcomeEmail: 'mockbee_send_welcome_email',
  sidebarCollapsed: 'sidebar_collapsed',
}

export function getItem(key, fallback = null) {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value
  } catch {
    return fallback
  }
}

export function setItem(key, value) {
  localStorage.setItem(key, value)
}

export function removeItem(key) {
  localStorage.removeItem(key)
}

export function getJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function setJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function clearSessionData() {
  ;[
    KEYS.interviews,
    KEYS.activities,
    KEYS.badges,
    KEYS.notifications,
    KEYS.notifUnread,
    'mockbee_subscription_expiry',
  ].forEach(removeItem)
}

export function clearAuthSession() {
  ;[
    KEYS.userName,
    KEYS.userEmail,
    KEYS.userPicture,
    KEYS.role,
    KEYS.isStudent,
    KEYS.isAdmin,
    KEYS.adminToken,
    KEYS.subscribed,
    KEYS.subscribedPlan,
    KEYS.allPlans,
    KEYS.subStartDate,
    KEYS.subEndDate,
    KEYS.subBilling,
    KEYS.interviews,
    KEYS.activities,
    KEYS.badges,
    KEYS.notifications,
    KEYS.notifUnread,
    KEYS.selectedRole,
    KEYS.lastPage,
  ].forEach(removeItem)
}

export function displayNameFrom(nameOrEmail) {
  if (!nameOrEmail) return 'User'
  return nameOrEmail.includes('@') ? nameOrEmail.split('@')[0] : nameOrEmail
}
