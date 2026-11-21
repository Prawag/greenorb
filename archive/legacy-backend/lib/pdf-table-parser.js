/**
 * Reconstructs table rows from pdf2json output using X/Y coordinates.
 * This helps maintain structural integrity of data when passing to LLM.
 */
export function reconstructTableRows(pdfJsonPages) {
  const allCells = [];
  
  for (const page of pdfJsonPages) {
    // pdf2json structure: page.Texts contains objects with R[0].T (text), x, y
    for (const textObj of page.Texts) {
      if (!textObj.R || !textObj.R[0]) continue;
      
      const content = decodeURIComponent(textObj.R[0].T);
      allCells.push({
        x: Math.round(textObj.x * 10) / 10,  // round to 1 decimal for better grouping
        y: Math.round(textObj.y * 10) / 10,
        text: content.trim()
      });
    }
  }
  
  if (allCells.length === 0) return [];

  // Group by Y coordinate (same row = same Y ± 0.3 units)
  // We use a small threshold to account for slight misalignments
  const rows = {};
  for (const cell of allCells) {
    // Cluster within ~0.3 units of Y
    const rowKey = Math.round(cell.y * 3.33); 
    if (!rows[rowKey]) rows[rowKey] = [];
    rows[rowKey].push(cell);
  }
  
  // Sort rows by their original average Y (top to bottom)
  const sortedRowKeys = Object.keys(rows).sort((a, b) => parseFloat(a) - parseFloat(b));

  return sortedRowKeys
    .map(key => {
      // Sort each row by X (left to right)
      return rows[key]
        .sort((a, b) => a.x - b.x)
        .map(c => c.text)
        .join(' | '); // Column separator for LLM awareness
    })
    .filter(rowText => rowText.trim().length > 3);
}
