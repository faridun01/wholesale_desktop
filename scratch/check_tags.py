
import sys

def count_tags(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    tags = ['<AnimatePresence', '</AnimatePresence>', '<motion.div', '</motion.div>', '<div', '</div']
    counts = {tag: content.count(tag) for tag in tags}
    
    print("Tag counts:")
    for tag, count in counts.items():
        print(f"{tag}: {count}")
    
    # Check braces
    open_curly = content.count('{')
    close_curly = content.count('}')
    open_paren = content.count('(')
    close_paren = content.count(')')
    
    print(f"\nBraces:")
    print(f"{{: {open_curly}, }}: {close_curly}")
    print(f"(: {open_paren}, ): {close_paren}")

if __name__ == "__main__":
    count_tags(sys.argv[1])
