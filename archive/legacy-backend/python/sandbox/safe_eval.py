import ast
import re
import operator
from typing import Any

"""
Safe deterministic formula evaluator.
Only allows arithmetic on named float variables.
Any other node type raises ValueError — no imports, no functions, no strings.
"""

SAFE_OPS = {
    ast.Add:  operator.add,
    ast.Sub:  operator.sub,
    ast.Mult: operator.mul,
    ast.Div:  operator.truediv,
}

def safe_eval(formula: str, variables: dict) -> float:
    """
    Evaluate a simple arithmetic formula with named variables.
    Example: safe_eval("scope_1 + scope_2", {"scope_1": 1200.0, "scope_2": 800.0})
    Returns 2000.0

    Raises ValueError for any non-arithmetic node — blocks all injection attempts.
    """
    tree = ast.parse(formula, mode="eval")
    for node in ast.walk(tree):
        if not isinstance(node, (
            ast.Expression, ast.BinOp, ast.Constant,
            ast.Name, ast.UnaryOp, ast.USub,
            *SAFE_OPS.keys()
        )):
            raise ValueError(
                f"Blocked AST node: {type(node).__name__}. "
                f"Only arithmetic operators and named variables are allowed."
            )
    return float(_eval_node(tree.body, variables))

def _eval_node(node, variables: dict):
    """Recursively evaluate a whitelisted AST node."""
    if isinstance(node, ast.Constant):
        return float(node.value)
    if isinstance(node, ast.Name):
        if node.id not in variables:
            raise ValueError(f"Unknown variable: '{node.id}'. Available: {list(variables.keys())}")
        return float(variables[node.id])
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return -_eval_node(node.operand, variables)
    if isinstance(node, ast.BinOp):
        op_fn = SAFE_OPS.get(type(node.op))
        if not op_fn:
            raise ValueError(f"Blocked operator: {type(node.op).__name__}")
        left  = _eval_node(node.left, variables)
        right = _eval_node(node.right, variables)
        if isinstance(node.op, ast.Div) and right == 0:
            raise ValueError("Division by zero in formula")
        return op_fn(left, right)
    raise ValueError(f"Unsupported node: {type(node).__name__}")


def coerce_float(value: Any, field_name: str = "") -> float | None:
    """
    Safely convert any LLM-returned value to float.
    Handles: "1,200", "1200 tCO2e", "Not disclosed", None, 0, "", "N/A"
    Returns None (not 0) when value is genuinely absent — null != zero in ESG.
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)  # Zero IS a valid ESG value (e.g., 0 data breaches)
    cleaned = str(value).strip()
    if cleaned.lower() in ("", "n/a", "not disclosed", "not available",
                            "nil", "none", "-", "–", "not reported", "nr",
                            "nd", "unknown"):
        return None
    # Find the first number-like string (handles ranges by stopping at the hyphen or space if it's not a minus sign)
    match = re.search(r'-?\d+[\d,.]*', cleaned)
    if not match:
        return None
        
    num_str = match.group().strip()
    
    # Check if it's European format (e.g., "1.200,50")
    last_comma = num_str.rfind(',')
    last_dot = num_str.rfind('.')
    
    if last_comma > last_dot and last_comma != -1:
        # European format: 1.200,50 -> 1200.50
        num_str = num_str.replace('.', '').replace(',', '.')
    else:
        # US format: 1,200.50 -> 1200.50
        num_str = num_str.replace(',', '')
        
    # If there are still multiple dots (e.g. "1.200.5" typo), keep only the last one
    if num_str.count('.') > 1:
        parts = num_str.rsplit('.', 1)
        num_str = parts[0].replace('.', '') + '.' + parts[1]
        
    try:
        return float(num_str)
    except ValueError:
        return None
