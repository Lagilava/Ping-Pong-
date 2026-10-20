# Gameplay feel: responsive controls

Human movement now has a time-based response shared by keyboard and gamepad in solo, local two-player and online play. Acceleration uses a 40/s exponential response; reversal uses 64/s and braking 60/s. At full input a stationary paddle reaches 90% speed in about 58 ms. Maximum speeds, settings multipliers, analog stick range and power-up multipliers remain as configured. Opposite keyboard directions cancel.

Pointer tracking uses an exact exponential approach at 32/s with the existing 2600 px/s speed cap. Integrating its requested velocity approaches the target without crossing it or oscillating around it. Touch drag offsets and paddle bounds remain in place.

Offline hit-stop slows the ball and world while human control uses the unslowed input timestep. Intentional time-warp powers retain their previous scale. AI movement continues to use the world timestep. Online play does not apply cosmetic hit-stop to physics: local, remote and ball movement stay on the same simulation clock. Existing impact audio, recoil and squash still communicate contact.

An actual spinning return struck by a moving human paddle can display a small SPIN callout. It uses the existing text renderer, is limited to the main ball, and has a 900 ms cooldown. It does not grant bonus damage, speed or points or alter the physics solver.

Validation: 14 regression scripts pass. The new control tests cover 60/120/240 Hz consistency, reversal, braking, analog precision, monotonic pointer tracking, opposite inputs, both local players, offline hit-stop, online clock consistency and time-warp behavior. Chromium checks cover impact-time input, pointer convergence, simulated guest control, spin feedback and rendering all six modes without page errors. This is a responsiveness improvement; subjective enjoyment and controller preference should still be checked with beta players.
