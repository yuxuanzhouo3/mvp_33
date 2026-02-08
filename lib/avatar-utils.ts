/**
 * Generate a color based on a string (name)
 * This ensures the same name always gets the same color
 */
export function getAvatarColor(name: string): string {
  // Generate a hash from the name
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  // Generate a color from the hash
  // Use a palette of nice colors (similar to DingTalk)
  const colors = [
    '#FF6B6B', // Red
    '#4ECDC4', // Teal
    '#45B7D1', // Blue
    '#FFA07A', // Light Salmon
    '#98D8C8', // Mint
    '#F7DC6F', // Yellow
    '#BB8FCE', // Purple
    '#85C1E2', // Sky Blue
    '#F8B739', // Orange
    '#52BE80', // Green
    '#EC7063', // Coral
    '#5DADE2', // Light Blue
    '#F1948A', // Pink
    '#7FB3D3', // Periwinkle
    '#76D7C4', // Aqua
  ]
  
  const index = Math.abs(hash) % colors.length
  return colors[index]
}

/**
 * Get initials from a name
 * For Chinese names, take the first character
 * For English names, take the first letter of each word (max 2)
 */
export function getInitials(name: string): string {
  if (!name) return '?'
  
  // Check if the name contains Chinese characters
  const hasChinese = /[\u4e00-\u9fa5]/.test(name)
  
  if (hasChinese) {
    // For Chinese names, take the first character
    return name.charAt(0)
  } else {
    // For English names, take first letter of each word (max 2)
    const words = name.trim().split(/\s+/)
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase()
    } else {
      return name.charAt(0).toUpperCase()
    }
  }
}





























