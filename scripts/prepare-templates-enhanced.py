import zipfile
import xml.etree.ElementTree as ET
import os
import shutil

NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
W_P = f'{{{NAMESPACE}}}p'
W_R = f'{{{NAMESPACE}}}r'
W_RPR = f'{{{NAMESPACE}}}rPr'
W_T = f'{{{NAMESPACE}}}t'

def get_replacement_text(text):
    text_clean = text.strip()
    text_lower = text_clean.lower()
    
    # 1. Check title placeholder
    if text_clean == "JUDUL":
        return "{JUDUL}"
    if "judul" in text_lower and ("menggunakan font" in text_lower or "times new roman" in text_lower or "ukuran 12" in text_lower):
        return "{JUDUL}"
        
    # 2. Check name placeholder
    if text_clean == "Nama" or text_clean == "nama":
        return "{NAMA}"
    if text_lower.startswith("nama:") and ("..." in text_lower or "___" in text_lower or ".." in text_lower or "….." in text_lower):
        return "Nama: {NAMA}"
    if text_clean == "Nama Mahasiswa":
        return "{NAMA}"
        
    # 3. Check NIM placeholder
    if "nim" in text_lower and ("xxxx" in text_lower or "0000" in text_lower or "2309" in text_lower):
        # We need to preserve the prefix (like "NIM: " or "NIM. ")
        if ":" in text_clean:
            return "NIM: {NIM}"
        elif "." in text_clean:
            return "NIM. {NIM}"
        else:
            return "NIM. {NIM}"
            
    return None

def clean_paragraph_placeholder(p):
    # Get all text elements in the paragraph
    t_nodes = list(p.iter(W_T))
    text = "".join(t_node.text for t_node in t_nodes if t_node.text).strip()
    
    if not text:
        return False

    replacement_text = get_replacement_text(text)
    if not replacement_text:
        return False
        
    print(f"      Replacing: '{text}' -> '{replacement_text}'")

    # Find the style of the first run to preserve formatting
    r_nodes = list(p.iter(W_R))
    r_pr_style = None
    for r in r_nodes:
        r_pr = r.find(W_RPR)
        if r_pr is not None:
            r_pr_style = r_pr
            break

    # Remove all runs from the paragraph
    for r in r_nodes:
        p.remove(r)

    # Create a new run with the same style and the placeholder text
    new_r = ET.Element(W_R)
    if r_pr_style is not None:
        new_r.append(r_pr_style)
        
    new_t = ET.Element(W_T)
    if replacement_text.startswith(" ") or replacement_text.endswith(" "):
        new_t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    new_t.text = replacement_text
    new_r.append(new_t)
    p.append(new_r)
    return True

def prepare_docx_template(src_path, dest_path):
    print(f"Preparing template: {os.path.basename(src_path)}")
    
    # Temporary directory to unpack and pack zip content
    temp_dir = dest_path + "_temp"
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir)
    
    # Extract
    with zipfile.ZipFile(src_path, 'r') as z:
        z.extractall(temp_dir)
        
    doc_xml_path = os.path.join(temp_dir, 'word', 'document.xml')
    if not os.path.exists(doc_xml_path):
        print(f"  Error: document.xml not found in {src_path}")
        shutil.rmtree(temp_dir)
        return False
        
    # Register namespaces to prevent prefix issues on output
    ET.register_namespace('w', NAMESPACE)
    ET.register_namespace('w14', 'http://schemas.microsoft.com/office/word/2010/wordml')
    ET.register_namespace('wp', 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing')
    ET.register_namespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main')
    ET.register_namespace('pic', 'http://schemas.openxmlformats.org/drawingml/2006/picture')
    ET.register_namespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    
    # Parse XML
    tree = ET.parse(doc_xml_path)
    root = tree.getroot()
    
    # Process paragraphs
    modified_count = 0
    for p in root.iter(W_P):
        if clean_paragraph_placeholder(p):
            modified_count += 1
            
    print(f"  Modified {modified_count} placeholders.")
    
    # Write back XML
    tree.write(doc_xml_path, encoding='utf-8', xml_declaration=True)
    
    # Pack back into docx zip
    if os.path.exists(dest_path):
        os.remove(dest_path)
        
    with zipfile.ZipFile(dest_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for root_dir, dirs, files in os.walk(temp_dir):
            for file in files:
                file_path = os.path.join(root_dir, file)
                arcname = os.path.relpath(file_path, temp_dir)
                z.write(file_path, arcname)
                
    shutil.rmtree(temp_dir)
    print(f"  Template successfully saved to: {dest_path}\n")
    return True

def main():
    source_dir = "/home/irsyad/Downloads/drive-download-20260607T175957Z-3-001"
    target_dir = "/home/irsyad/Gudang/mydevelopment/uhn-academic-helper/src/templates"
    
    if not os.path.exists(target_dir):
        os.makedirs(target_dir)
        
    configs = [
        # Cover templates
        {
            "src": os.path.join(source_dir, "Proposal Skripsi", "template cover proposal skripsi.docx"),
            "dest": os.path.join(target_dir, "proposal_template.docx")
        },
        {
            "src": os.path.join(source_dir, "Skripsi", "template cover skripsi.docx"),
            "dest": os.path.join(target_dir, "skripsi_template.docx")
        },
        {
            "src": os.path.join(source_dir, "Kerja Praktik Industri (KPI)", "template cover KPI.docx"),
            "dest": os.path.join(target_dir, "kpi_template.docx")
        },
        # Approval templates
        {
            "src": os.path.join(source_dir, "Proposal Skripsi", "template halaman persetujuan proposal skripsi.docx"),
            "dest": os.path.join(target_dir, "proposal_approval_template.docx")
        },
        {
            "src": os.path.join(source_dir, "Skripsi", "template lembar pengesahan dan perstujuan Skripsi.docx"),
            "dest": os.path.join(target_dir, "skripsi_approval_template.docx")
        },
        {
            "src": os.path.join(source_dir, "Kerja Praktik Industri (KPI)", "template halaman pengesahan KPI.docx"),
            "dest": os.path.join(target_dir, "kpi_approval_template.docx")
        }
    ]
    
    for config in configs:
        if os.path.exists(config["src"]):
            prepare_docx_template(config["src"], config["dest"])
        else:
            print(f"Source template not found: {config['src']}")

if __name__ == "__main__":
    main()
