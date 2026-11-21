import sys
import json

def main():
    print(json.dumps({"success": True, "message": "Test successful", "args": sys.argv}))

if __name__ == "__main__":
    main()
