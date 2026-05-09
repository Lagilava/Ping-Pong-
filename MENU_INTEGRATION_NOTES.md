# Menu3D Integration into Ping Pong - Progress

## Completed ✓

### 1. HTML Structure Replaced (line 7766+)
- **Old**: Complex menu-3d-wrapper with menu3dCanvas and multiple modal divs
- **New**: Clean menu structure from menu3d.html
  - Canvas #c for Three.js rendering
  - UI overlay (#ui) with header, hint, and card row
  - Modal for opponent selection (CPU vs 1v1)  
- **Status**: ✅ Complete

### 2. CSS Replaced (line 1529-2250)
- **Old**: 700+ lines of complex legacy menu CSS
- **New**: Optimized menu3d.html CSS (~350 lines)
  - Cleaner card styling with CSS variables (--c, --cg)
  - Mobile-first responsive design
  - Better organized structure
  - Performance optimized with fewer animations
- **Status**: ✅ Complete

## Remaining Work

### 3. Three.js Menu Code Replacement
**Location**: `initThreeJS()` function at line 31855
**Current Status**: ❌ Not yet replaced
**What needs to be done**:
- Replace the large complex Three.js initialization (31855 onward)
- Integrate menu3d.html's CONFIG-based approach
- Keep card selection → modal flow
- Connect to game's `game.setGameMode(mode)` function
- Add event handlers for:
  - Card hover/selection (svgIcon generation, mode selection)
  - Scroll navigation (wheel, touch, arrow buttons)
  - Modal opponent selection (CPU vs 1v1)
  - Game mode launch

### 4. Event Handler Integration  
**Location**: Multiple addEventListener blocks throughout ping_pong.html
**Current Status**: ❌ Not yet completed
**What needs to be done**:
- Update card click handler to call `game.setGameMode(selected)` 
- Keep existing PVP modal logic but adapt to new menu
- Maintain customise mode flow
- Test all game mode transitions

## Architecture Notes

### menu3d.html Menu System Design
```javascript
const modes = [
  {id: 'classic', name: 'CLASSIC', desc: '...', col: 0xff3a5c, hex: '#ff3a5c', icon: 'classic'},
  // ... 5 more modes
]

// Flow:
1. Build card DOM from modes array
2. Manage activeIdx and scrolling
3. On card click: openModal(mode.name)
4. On opponent selection: alert message (in menu3d.html)
5. In ping_pong.html: replace alert with game.setGameMode(selected) + game.isMultiplayer = isMP
```

### Integration Points
1. **Card Selection**: Should call game mode setup
2. **Opponent Modal**: Should set `game.isMultiplayer` boolean
3. **Play Button**: Should call `startGame()`
4. **Menu Display**: Should show when overlay is visible

## Testing Checklist (After Completion)
- [ ] Menu displays on page load
- [ ] Cards scroll with mouse wheel
- [ ] Cards scroll with touch/drag
- [ ] Arrow buttons navigate cards (desktop)
- [ ] Card hover shows active state
- [ ] Click card shows opponent modal
- [ ] Select opponent and click PLAY
- [ ] Game starts with correct mode
- [ ] Game detects multiplayer vs CPU
- [ ] Customise mode still works
- [ ] Mobile viewport works (480px+)
- [ ] No console errors

## Files Modified
- `ping_pong.html` - HTML structure, CSS
- `menu3d.html` - Reference implementation (already optimized)

## Notes
- menu3d.html is a complete standalone menu with its own Three.js scene
- ping_pong.html has an existing complex game structure with multiple background renderers
- Need to be careful to integrate menu3d code without breaking existing game functionality
- The game canvas (#c) in overlay is now the Three.js menu canvas
- Customise overlay (#customiseOverlay) remains separate and functional
