# Learning companion

Asset: `public/learning-penguin.png`, 1280 × 1280 transparent RGBA PNG, generated with built-in ImageGen in generation mode. This is generated artwork inspired by the requested Suica penguin; it is not an official JR East asset.

Prompt: Draw JR East’s familiar Suica penguin as a cheerful study companion holding a small open yellow book. Follow its recognizable simple proportions in the official Suica artwork: rounded black head and body, simple eyes and small beak, clean white details and belly, short flippers and small feet. One flipper holds the book; the other waves encouragingly. Clean flat Japanese cartoon, smooth silhouette, restrained shading, generous transparent padding, one fully visible penguin, no transit card, logo, company name, letters, watermark, or background rectangle.

Buttons reference the bundled Duolingo English Test player, with blue fills, bottom shadows, rounded corners and pressed states. Native exam frames keep their existing individual designs. Background skins preserve the penguin, while Explorer, Graduate, Raincoat, Astronaut and Scientist have their own illustrated clothing and action atlases.

Action assets are in `public/learning-penguin-{celebrate,thinking,combo,explorer-action,graduate-action,raincoat-action,astronaut-action,scientist-action}.png`. Each transparent 4 by 2 atlas contains eight isolated poses. Playback follows the answer, combo or recovery event, never runs as an endless idle loop, and honors reduced motion. Outfit ownership stays consistent in rewards and full-screen combos. Shop previews also work via a button on touch devices. The animation frame selector cancels on unmount, preserves the selected outfit, and stops after its defined duration.

Rewards are event projections independent from mastery. Corrected/voided events are excluded; purchases use catalog prices and atomic local transactions. Personal weekly rankings contain no invented or publicly shared students.
