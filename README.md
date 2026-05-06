# PuzGod
An Electron-wrapped, lightweight version of HTML 5 crossword solver. This can run as a standalone app on your PC. Handles multiple puzzle formats (JPZ, PUZ, iPuz, etc.) in a browser.

## Installation
Download the executable from the Releases page. Running it for the first time will automatically install it on a Windows machine.

## Supports
Crosswords
Rebus entries

## Does not support
Acrostic, Diagramless, Coded, or other non-standard crossword formats

### Print Functionality
The solver includes a "Print" option in the File menu, which utilizes `jsPDF` (bundled within `jscrossword_combined.js`) to generate a printable PDF version of the crossword. This feature allows users to print the current state of the puzzle directly from their browser.
