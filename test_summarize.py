import unittest
from summarize import sanitize_math_expression, evaluate_math_expression
import logging

class TestMathOperations(unittest.TestCase):
    def setUp(self):
        logging.basicConfig(level=logging.INFO)

    def test_sanitize_expression(self):
        test_cases = [
            ("cuánto es 2+2?", "2+2"),
            ("cuanto es 3 * (4+5)", "3*(4+5)"),
            ("¿cuánto es 10/2?", "10/2"),
            ("cuanto es 5-3", "5-3"),
        ]
        
        for input_expr, expected in test_cases:
            with self.subTest(input_expr=input_expr):
                result = sanitize_math_expression(input_expr)
                self.assertEqual(result, expected, 
                    f"Failed to sanitize '{input_expr}'. Expected '{expected}', got '{result}'")

    def test_evaluate_expression(self):
        test_cases = [
            ("cuánto es 2+2?", "El resultado de 2+2 es 4"),
            ("cuanto es 3 * (4+5)", "El resultado de 3*(4+5) es 27"),
            ("¿cuánto es 10/2?", "El resultado de 10/2 es 5"),
            ("cuanto es 5-3", "El resultado de 5-3 es 2"),
        ]
        
        for input_expr, expected in test_cases:
            with self.subTest(input_expr=input_expr):
                result = evaluate_math_expression(input_expr)
                self.assertEqual(result, expected,
                    f"Failed to evaluate '{input_expr}'. Expected '{expected}', got '{result}'")

if __name__ == '__main__':
    unittest.main()
