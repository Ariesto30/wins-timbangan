export function getUser() {
  try { return JSON.parse(localStorage.getItem('wins_user')) } catch { return null }
}
export function getToken() { return localStorage.getItem('wins_token') }
export function isLoggedIn() { return !!getToken() }
export function logout() {
  localStorage.removeItem('wins_token')
  localStorage.removeItem('wins_user')
}
export function hasRole(...roles) {
  const u = getUser()
  return u && roles.includes(u.role)
}
