const hasText = value => typeof value === 'string' && value.trim() !== '';
const validTime = value => Number.isFinite(value) && value >= 0;

// Check the shape of an action. The reducer decides whether it is allowed now.
export function isValidAction(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return false;
  }

  // The server may add a player ID. Single-screen actions may omit it.
  if (action.player != null && !hasText(action.player)) {
    return false;
  }

  switch (action.type) {
    case 'select': // needs a control ID
    case 'deselect':
      return hasText(action.id);

    case 'confirm': // no extra data needed
    case 'reset':
      return true;

    case 'next':
      // The reducer requires time when this move starts a checkpoint.
      return action.now === undefined || validTime(action.now);

    case 'answer':
      return hasText(action.questionId)
        && ['A', 'B', 'C', 'D'].includes(action.choice)
        && validTime(action.now);

    case 'pause': // needs to implement a pause timer
    case 'resume': // needs to implement a resume timer
    case 'timeout':
      return validTime(action.now);

    default:
      return false;
  }
}
