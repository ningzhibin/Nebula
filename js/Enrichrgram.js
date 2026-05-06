// Patched from MaayanLab/clustergrammer master:
//   1. amp.pharm.mssm.edu → maayanlab.cloud
//   2. All API calls rewritten with fetch() (fixes 400 body-on-GET jQuery bug)
//   3. Library selector replaced with full HTML modal:
//        - All ~225 libraries fetched live from /datasetStatistics
//        - Category filter tabs + live search
//   4. Retry bug fixed

var genes_were_found = {};
enr_obj = {};

function check_setup_enrichr(inst_cgm){

  var has_enrichrgram = _.has(inst_cgm.params.network_data, 'enrichrgram');

  var make_enrichrgram = false;
  if (has_enrichrgram){
    make_enrichrgram = inst_cgm.params.network_data.enrichrgram;
  }

  if (has_enrichrgram === false){

    genes_were_found[inst_cgm.params.root] = false;

    var all_rows = inst_cgm.params.network_data.row_nodes_names;

    if (all_rows.length > 20){
      all_rows = all_rows.slice(0, 20);
    }

    var wait_unit = 500;
    var wait_time = 0;

    _.each(all_rows, function(inst_name){
      setTimeout(check_gene_request, wait_time, inst_cgm, inst_name, run_ini_enrichr);
      wait_time = wait_time + wait_unit;
    });

  } else if (make_enrichrgram) {

    run_ini_enrichr(inst_cgm);
    genes_were_found[inst_cgm.params.root] = true;

  }

}

function run_ini_enrichr(inst_cgm){

  var inst_root = inst_cgm.params.root;

  var has_enrichrgram = _.has(inst_cgm.params.network_data, 'enrichrgram');
  var make_enrichrgram = false;
  if (has_enrichrgram){ make_enrichrgram = inst_cgm.params.network_data.enrichrgram; }

  if (genes_were_found[inst_root] || make_enrichrgram){

    if (d3.select(inst_root + ' .enrichr_logo').empty()){

      enr_obj[inst_root] = Enrichrgram(inst_cgm);
      enr_obj[inst_root].enrichr_icon();

      // "Send genes to Enrichr" link inside the dendrogram modal
      var enrichr_section = d3.selectAll(inst_root + ' .dendro_info')
        .select('.modal-body')
        .append('div')
        .classed('enrichr_export_section', true)
        .style('margin-top', '10px');

      enrichr_section.append('text').text('Send genes to ');

      enrichr_section.append('a').html('Enrichr')
        .on('click', function(){
          var group_string = d3.select(inst_root + ' .dendro_text input').attr('value');
          var gene_list = group_string.replace(/, /g, '\n');
          send_to_Enrichr({list: gene_list, description: 'Clustergrammer gene-cluster list', popup: true});
        });

    }

  }

}

function check_gene_request(inst_cgm, gene_symbol, run_ini_enrichr){

  if (gene_symbol.indexOf(' ') > 0){
    gene_symbol = gene_symbol.split(' ')[0];
  } else if (gene_symbol.indexOf('_') > 0){
    gene_symbol = gene_symbol.split('_')[0];
  }

  // maayanlab.cloud Harmonizome, fetch() instead of $.get()
  var url = 'https://maayanlab.cloud/Harmonizome/api/1.0/gene/' + gene_symbol;

  if (genes_were_found[inst_cgm.params.root] === false){
    if (isNaN(gene_symbol)){
      fetch(url)
        .then(function(res){ return res.text(); })
        .then(function(text){
          var data = JSON.parse(text);
          if (data.name != undefined){
            genes_were_found[inst_cgm.params.root] = true;
          }
          run_ini_enrichr(inst_cgm, gene_symbol);
        })
        .catch(function(){ /* gene not found, skip */ });
    }
  }

}

// ─── Species / Enrichr endpoint config ───────────────────────────────────────
var ENRICHR_SPECIES = [
  { name: 'Human',  label: 'Human',              abbr: 'Hs',  url: 'https://maayanlab.cloud/Enrichr'     },
  { name: 'Fly',    label: 'Fly (D. melanogaster)', abbr: 'Dm', url: 'https://maayanlab.cloud/FlyEnrichr'  },
  { name: 'Yeast',  label: 'Yeast (S. cerevisiae)', abbr: 'Sc', url: 'https://maayanlab.cloud/YeastEnrichr'},
  { name: 'Worm',   label: 'Worm (C. elegans)',     abbr: 'Ce', url: 'https://maayanlab.cloud/WormEnrichr' },
  { name: 'Fish',   label: 'Fish (D. rerio)',        abbr: 'Dr', url: 'https://maayanlab.cloud/FishEnrichr' },
];

// ─── Category definitions for the library browser ────────────────────────────
var ENRICHR_CATEGORIES = [
  { name: 'All',           pattern: null },
  { name: 'Gene Ontology', pattern: /^GO_/ },
  { name: 'Pathways',      pattern: /^(KEGG|Reactome|WikiPathway|BioCarta|Panther|MSigDB|PFOCR|BioPlanet|HumanCyc|Elsevier|NCI)/ },
  { name: 'Transcription', pattern: /^(ChEA|ENCODE_TF|ENCODE_Histone|TRRUST|TF_|ARCHS4_TFs|JASPAR|TRANSFAC|Genome_Browser|Rummagene_transcription|Enrichr_Submissions|ESCAPE)/ },
  { name: 'Kinases',       pattern: /^(KEA|Kinase_|ARCHS4_Kinases|HMS_LINCS|L1000_Kinase|Phosphatase|The_Kinase|Rummagene_kinases)/ },
  { name: 'Disease',       pattern: /^(Disease_|OMIM|DisGeNET|ClinVar|GWAS|Jensen_DISEASE|MAGMA|Rare_Disease|Human_Phenotype|GeDiPNet|MAGNET|PhenGenI|PheWeb|dbGaP|UK_Biobank|COVID)/ },
  { name: 'Drugs',         pattern: /^(Drug_|LINCS|L1000_Chem|Old_CMAP|DGIdb|DSigDB|DrugMatrix|Proteomics_Drug|NIBR_DRUGseq|Carcinogenome|Sciplex|TG_GATES|MCF7_Perturbations)/ },
  { name: 'Cell Types',    pattern: /^(CellMarker|PanglaoDB|Azimuth|HuBMAP|Descartes|Allen_Brain|Tabula)/ },
  { name: 'Tissues/Expr',  pattern: /^(GTEx|Jensen_TISSUE|TISSUES_|SubCell|Jensen_COMPARTMENT|COMPARTMENTS|Human_Gene_Atlas|Mouse_Gene_Atlas|Tissue_Protein|ARCHS4_Tissue)/ },
  { name: 'Mouse/Phenotype', pattern: /^(MGI_Mammalian|KOMP2|Mouse_Gene_Atlas|HDSigDB_Mouse|WikiPathways_2019_Mouse|WikiPathways_2024_Mouse|KEGG_2019_Mouse|Tabula_Muris)/ },
];

// Fallback list if the API call fails
// Comprehensive fallback library list — used when Enrichr API is unreachable.
// Covers all major categories as of 2025/2026.
var ENRICHR_FALLBACK_LIBS = [
  // Gene Ontology
  'GO_Biological_Process_2025','GO_Molecular_Function_2025','GO_Cellular_Component_2025',
  'GO_Biological_Process_2023','GO_Molecular_Function_2023','GO_Cellular_Component_2023',
  'GO_Biological_Process_2021','GO_Molecular_Function_2021','GO_Cellular_Component_2021',
  // Pathways
  'KEGG_2021_Human','KEGG_2019_Human','KEGG_2019_Mouse',
  'Reactome_2022','Reactome_Pathways_2024',
  'WikiPathways_2024_Human','WikiPathways_2024_Mouse','WikiPathways_2019_Human',
  'BioPlanet_2019','PANTHER_2016',
  'NCI-Nature_2016','MSigDB_Hallmark_2020',
  'Elsevier_Pathway_Collection','HumanCyc_2016','SMPDB_Pathways',
  // Transcription
  'ChEA_2022','ChEA_2016','ChEA_2015',
  'ENCODE_TF_ChIP-seq_2015','ENCODE_and_ChEA_Consensus_TFs_from_ChIP-X',
  'ENCODE_Histone_Modifications_2015','ENCODE_Histone_Modifications_2013',
  'TRANSFAC_and_JASPAR_PWMs','JASPAR_Transcription_Factors_2020',
  'Genome_Browser_PWMs','TRRUST_Transcription_Factors_2019',
  'TF_Perturbations_Followed_by_Expression','TargetScan_microRNA_2017',
  'miRTarBase_2017','Epigenomics_Roadmap_HM_ChIP-seq',
  'lncHUB_lncRNA_Co-Expression',
  // Kinases
  'KEA_2015','ARCHS4_Kinases_Coexp','Kinase_Perturbations_from_GEO_up',
  'Kinase_Perturbations_from_GEO_down','PhosphoSitePlus_2016',
  'Phosphatase_Substrates_from_DEPOD',
  // Disease
  'GWAS_Catalog_2023','GWAS_Catalog_2019',
  'DisGeNET','OMIM_Disease','OMIM_Expanded',
  'Jensen_DISEASES','UK_Biobank_GWAS_v1',
  'ClinVar_2019','Orphanet_Augmented_2021',
  'Disease_Perturbations_from_GEO_up','Disease_Perturbations_from_GEO_down',
  'Old_CMAP_up','Old_CMAP_down',
  // Drugs
  'LINCS_L1000_Chem_Pert_up','LINCS_L1000_Chem_Pert_down',
  'LINCS_L1000_Chem_Pert_Consensus_Sigs',
  'DrugMatrix','Drug_Perturbations_from_GEO_2014',
  'Drug_Perturbations_from_GEO_up','Drug_Perturbations_from_GEO_down',
  'DSigDB','L1000FWD_Upregulated_with_Drug','L1000FWD_Downregulated_with_Drug',
  // Cell Types
  'Azimuth_Cell_Types_2021','PanglaoDB_Augmented_2021','CellMarker_Augmented_2021',
  'ARCHS4_Cell-lines','Human_Gene_Atlas','Mouse_Gene_Atlas',
  'Allen_Brain_Atlas_10x_scRNA_2021','Allen_Brain_Atlas_Adult_Mouse_Brain_2023',
  'Tabula_Muris','Tabula_Sapiens',
  // Tissues / Expression
  'ARCHS4_Tissues','GTEx_Aging_Signatures_2021','GTEx_Gene_Expression_Profiling_up',
  'GTEx_Gene_Expression_Profiling_down','Jensen_TISSUES','ProteomicsDB_2020',
  'Human_Proteome_Map',
  // Mouse / Phenotype
  'MGI_Mammalian_Phenotype_Level_4_2024','MGI_Mammalian_Phenotype_Level_4_2021',
  'MGI_Mammalian_Phenotype_2017','Human_Phenotype_Ontology',
  'UK_Biobank_GWAS_v1','Jensen_COMPARTMENTS','BioCarta_2016',
];

function Enrichrgram(inst_cgm){

  var inst_root = inst_cgm.params.root;
  var currentSpecies = ENRICHR_SPECIES[0];  // shared with post_list/get_enr and modal species selector

  // ── Enrichr icon (SVG) + HTML library-selection modal ──────────────────────

  function enrichr_icon(){

    var low_opacity = 0.7;
    var icon_size   = 42;
    var d3_tip_custom = inst_cgm.d3_tip_custom();

    var enrichr_description =
      'Perform enrichment analysis, using Enrichr, to find biological <br>' +
      'information specific to your set (or subset) of genes.<br><br>' +
      'Select a subset of genes using the brush-cropping tool or the crop buttons on the dendrogram.';

    var enr_tip = d3_tip_custom()
      .attr('class', function(){
        return inst_cgm.params.viz.root_tips.replace('.','') + '_enr_tip d3-tip';
      })
      .direction('se').style('display','none').offset([-10,-5])
      .html(function(){ return enrichr_description; });

    // SVG Enrichr logo button
    d3.select(inst_root+' .viz_svg').append('svg:image')
      .attr('x', 50).attr('y', 2)
      .attr('width', icon_size).attr('height', icon_size)
      .attr('xlink:href', 'https://maayanlab.cloud/Enrichr/images/enrichr-icon.png')
      .style('opacity', low_opacity)
      .classed('enrichr_logo', true)
      .attr('id', 'enrichr_menu_button_' + inst_cgm.params.root.replace('#',''))
      .on('click', openModal)
      .on('mouseover', function(){
        if (!d3.select(inst_cgm.params.root+' .enrichr_menu').classed('showing')){
          d3.selectAll(inst_cgm.params.viz.root_tips + '_enr_tip')
            .style('opacity',1).style('display','block');
          enr_tip.show();
        }
      })
      .on('mouseout', function(){
        d3.selectAll(inst_cgm.params.viz.root_tips + '_enr_tip')
          .style('opacity',0).style('display','block');
        enr_tip.hide();
      })
      .call(enr_tip);

    // Invisible placeholder so existing code that queries .enrichr_menu still works
    d3.select(inst_root+' .viz_svg')
      .append('g').classed('enrichr_menu', true).classed('showing', false).style('display','none');

    // ── Build HTML modal ────────────────────────────────────────────────────
    var modal_id = 'enr_modal_' + inst_root.replace(/[^a-zA-Z0-9]/g, '_');

    // Remove stale modal if re-init
    var old = document.getElementById(modal_id + '_bd');
    if (old) old.parentNode.removeChild(old);

    // Backdrop
    var bd = document.createElement('div');
    bd.id = modal_id + '_bd';
    bd.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;' +
      'background:rgba(0,0,0,0.4);z-index:9998;display:none;';
    bd.addEventListener('click', function(e){ if (e.target === bd) closeModal(); });

    // Modal box
    var box = document.createElement('div');
    box.style.cssText =
      'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'background:#fff;border-radius:8px;box-shadow:0 4px 28px rgba(0,0,0,.35);' +
      'width:640px;max-height:72vh;display:flex;flex-direction:column;z-index:9999;' +
      'font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;';

    // Header
    var hdr = document.createElement('div');
    hdr.style.cssText = 'padding:14px 18px;border-bottom:1px solid #e0e0e0;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;';
    hdr.innerHTML =
      '<span style="font-size:17px;font-weight:700;">Choose Enrichr Library</span>' +
      '<button id="' + modal_id + '_close" style="border:none;background:none;font-size:22px;cursor:pointer;color:#888;line-height:1;padding:0 4px;" title="Close">×</button>';
    box.appendChild(hdr);

    // Search + species + category filter bar
    var fb = document.createElement('div');
    fb.style.cssText = 'padding:10px 18px 8px;border-bottom:1px solid #e0e0e0;flex-shrink:0;';
    fb.innerHTML =
      '<input id="' + modal_id + '_search" type="text" placeholder="🔍  Search all libraries…" ' +
      'style="width:100%;box-sizing:border-box;padding:7px 11px;border:1px solid #ccc;' +
      'border-radius:4px;font-size:13px;outline:none;">' +
      '<div style="margin-top:8px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
        '<span style="font-size:11px;color:#666;white-space:nowrap;font-weight:600;">Species:</span>' +
        '<div id="' + modal_id + '_species" style="display:flex;flex-wrap:wrap;gap:4px;"></div>' +
      '</div>' +
      '<div style="margin-top:2px;font-size:10px;color:#aaa;" id="' + modal_id + '_species_note"></div>' +
      '<div id="' + modal_id + '_tabs" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;"></div>';
    box.appendChild(fb);

    // Server-offline notice banner (hidden by default, shown when fallback is used)
    var offlineEl = document.createElement('div');
    offlineEl.id = modal_id + '_offline';
    offlineEl.style.cssText =
      'display:none;padding:7px 18px;background:#fff8e1;border-bottom:1px solid #ffe082;' +
      'font-size:11.5px;color:#7a5c00;flex-shrink:0;';
    offlineEl.innerHTML =
      '⚠ Could not reach the Enrichr server (maayanlab.cloud). ' +
      'Showing a built-in library list. ' +
      '<button id="' + modal_id + '_retry" ' +
      'style="margin-left:6px;padding:1px 8px;font-size:11px;border:1px solid #b8860b;' +
      'background:#fff;color:#7a5c00;border-radius:3px;cursor:pointer;">Try again</button>';
    box.appendChild(offlineEl);

    // Count badge
    var countEl = document.createElement('div');
    countEl.id = modal_id + '_count';
    countEl.style.cssText = 'padding:4px 18px;font-size:11px;color:#888;flex-shrink:0;border-bottom:1px solid #f0f0f0;';
    box.appendChild(countEl);

    // Library list
    var listEl = document.createElement('div');
    listEl.id = modal_id + '_list';
    listEl.style.cssText = 'flex:1;overflow-y:auto;padding:4px 10px;';
    box.appendChild(listEl);

    // Footer
    var ftr = document.createElement('div');
    ftr.style.cssText = 'padding:11px 18px;border-top:1px solid #e0e0e0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;';
    ftr.innerHTML =
      '<span id="' + modal_id + '_export" style="cursor:pointer;color:#337ab7;font-size:13px;">↗ Export all genes to Enrichr</span>' +
      '<span id="' + modal_id + '_clear" style="cursor:pointer;color:#dc3545;font-size:13px;display:none;">✕ Clear Results</span>';
    box.appendChild(ftr);

    bd.appendChild(box);
    document.body.appendChild(bd);

    // ── State ───────────────────────────────────────────────────────────────
    var allLibrariesBySpecies = {};   // cache per species name
    var allLibraries   = [];
    var currentCat     = 'All';
    var currentSearch  = '';
    var activeLib      = null;
    currentSpecies = ENRICHR_SPECIES[0];  // assign to outer Enrichrgram scope (default: Human)

    // ── Species selector ─────────────────────────────────────────────────────
    var speciesEl   = document.getElementById(modal_id + '_species');
    var speciesNote = document.getElementById(modal_id + '_species_note');

    ENRICHR_SPECIES.forEach(function(sp){
      var btn = document.createElement('button');
      btn.textContent = sp.label;
      btn.setAttribute('data-sp', sp.name);
      var isActive = sp.name === currentSpecies.name;
      btn.style.cssText =
        'padding:3px 10px;border:1px solid #ccc;border-radius:12px;' +
        'background:' + (isActive ? '#198754' : '#f8f9fa') + ';' +
        'color:'       + (isActive ? '#fff'    : '#333')    + ';' +
        'font-size:11px;cursor:pointer;white-space:nowrap;';
      btn.addEventListener('click', function(){
        if (sp.name === currentSpecies.name) return;
        currentSpecies = sp;
        // Update button styles
        speciesEl.querySelectorAll('button').forEach(function(b){
          var active = b.getAttribute('data-sp') === sp.name;
          b.style.background = active ? '#198754' : '#f8f9fa';
          b.style.color       = active ? '#fff'    : '#333';
        });
        // Load cached or fetch fresh library list for new species
        if (allLibrariesBySpecies[sp.name]) {
          allLibraries = allLibrariesBySpecies[sp.name];
          renderList();
        } else {
          allLibraries = [];
          fetchLibraries();
        }
      });
      speciesEl.appendChild(btn);
    });

    function updateSpeciesNote(usingFallback){
      if (!speciesNote) return;
      var note = currentSpecies.url;
      if (usingFallback) note += ' — using built-in list';
      speciesNote.textContent = note;
    }

    // ── Category tabs ────────────────────────────────────────────────────────
    var tabsEl = document.getElementById(modal_id + '_tabs');
    ENRICHR_CATEGORIES.forEach(function(cat){
      var btn = document.createElement('button');
      btn.textContent = cat.name;
      btn.setAttribute('data-cat', cat.name);
      btn.style.cssText =
        'padding:3px 10px;border:1px solid #ccc;border-radius:12px;' +
        'background:' + (cat.name === 'All' ? '#0d6efd' : '#f8f9fa') + ';' +
        'color:'       + (cat.name === 'All' ? '#fff'    : '#333')    + ';' +
        'font-size:11px;cursor:pointer;white-space:nowrap;';
      btn.addEventListener('click', function(){
        currentCat = cat.name;
        tabsEl.querySelectorAll('button').forEach(function(b){
          var active = b.getAttribute('data-cat') === currentCat;
          b.style.background = active ? '#0d6efd' : '#f8f9fa';
          b.style.color       = active ? '#fff'    : '#333';
        });
        renderList();
      });
      tabsEl.appendChild(btn);
    });

    // ── Render list ──────────────────────────────────────────────────────────
    function renderList(){
      var listDiv  = document.getElementById(modal_id + '_list');
      var countDiv = document.getElementById(modal_id + '_count');
      listDiv.innerHTML = '';

      var term = currentSearch.toLowerCase();
      var cat  = ENRICHR_CATEGORIES.find(function(c){ return c.name === currentCat; });

      var filtered = allLibraries.filter(function(lib){
        var matchCat    = !cat.pattern || cat.pattern.test(lib);
        var matchSearch = !term || lib.toLowerCase().indexOf(term) >= 0;
        return matchCat && matchSearch;
      });

      if (countDiv) countDiv.textContent = filtered.length + ' / ' + allLibraries.length + ' libraries';

      if (filtered.length === 0){
        listDiv.innerHTML = '<p style="color:#999;font-size:13px;padding:12px 8px;">No libraries match.</p>';
        return;
      }

      var frag = document.createDocumentFragment();
      filtered.forEach(function(lib){
        var row = document.createElement('div');
        row.style.cssText =
          'display:flex;align-items:center;padding:6px 8px;cursor:pointer;border-radius:4px;';

        var dot = document.createElement('div');
        dot.style.cssText =
          'width:13px;height:13px;border-radius:50%;border:2px solid #aaa;' +
          'margin-right:10px;flex-shrink:0;' +
          'background:' + (lib === activeLib ? '#dc3545' : '#fff') + ';';

        var label = document.createElement('span');
        label.style.cssText = 'font-size:13px;color:#333;';
        label.textContent = lib.replace(/_/g, ' ');

        row.appendChild(dot);
        row.appendChild(label);

        row.addEventListener('mouseover', function(){ row.style.background = '#f0f4ff'; });
        row.addEventListener('mouseout',  function(){ row.style.background = ''; });

        row.addEventListener('click', function(){
          activeLib = lib;
          // update all dots
          listDiv.querySelectorAll('div > div:first-child').forEach(function(d){
            d.style.background = '#fff';
          });
          dot.style.background = '#dc3545';

          var clearBtn = document.getElementById(modal_id + '_clear');
          if (clearBtn) clearBtn.style.display = 'inline';

          enr_obj.enrichr_rows(lib, update_viz_callback, 10);
          make_enr_wait_circle();
          animate_wait();

          setTimeout(closeModal, 400);
        });

        frag.appendChild(row);
      });
      listDiv.appendChild(frag);
    }

    // ── Search handler ───────────────────────────────────────────────────────
    var searchInput = document.getElementById(modal_id + '_search');
    searchInput.addEventListener('input', function(){
      currentSearch = this.value;
      renderList();
    });

    // ── Close ────────────────────────────────────────────────────────────────
    document.getElementById(modal_id + '_close').addEventListener('click', closeModal);

    // ── Export ───────────────────────────────────────────────────────────────
    document.getElementById(modal_id + '_export').addEventListener('click', function(){
      var gene_list = inst_cgm.params.network_data.row_nodes_names.join('\n');
      enrich({list: gene_list, description: 'Clustergrammer gene list', popup: true});
    });

    // ── Clear results ─────────────────────────────────────────────────────────
    document.getElementById(modal_id + '_clear').addEventListener('click', function(){
      activeLib = null;
      this.style.display = 'none';
      closeModal();
      clear_enrichr_results(true);
    });

    // ── Fetch library list (with 5 s timeout → fallback) ─────────────────────
    // Uses currentSpecies.url; caches results per species in allLibrariesBySpecies.
    function fetchLibraries(){
      var offlineBanner = document.getElementById(modal_id + '_offline');
      if (offlineBanner) offlineBanner.style.display = 'none';
      listEl.innerHTML = '<p style="color:#999;font-size:13px;padding:12px 8px;">Loading libraries for ' + currentSpecies.label + '…</p>';
      var fetchingSpecies = currentSpecies; // capture in closure

      var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timeoutId  = controller ? setTimeout(function(){ controller.abort(); }, 5000) : null;

      fetch(fetchingSpecies.url + '/datasetStatistics',
            controller ? { signal: controller.signal } : {})
        .then(function(res){
          if (timeoutId) clearTimeout(timeoutId);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function(data){
          if (data && data.statistics && data.statistics.length) {
            allLibrariesBySpecies[fetchingSpecies.name] =
              data.statistics.map(function(s){ return s.libraryName; }).sort();
            if (currentSpecies.name === fetchingSpecies.name) {
              allLibraries = allLibrariesBySpecies[fetchingSpecies.name];
              if (offlineBanner) offlineBanner.style.display = 'none';
              updateSpeciesNote(false);
              renderList();
            }
          } else {
            throw new Error('empty statistics');
          }
        })
        .catch(function(){
          if (timeoutId) clearTimeout(timeoutId);
          // Use fallback only for Human (other species don't have curated fallbacks)
          var fb = fetchingSpecies.name === 'Human' ? ENRICHR_FALLBACK_LIBS.slice().sort() : [];
          allLibrariesBySpecies[fetchingSpecies.name] = fb;
          if (currentSpecies.name === fetchingSpecies.name) {
            allLibraries = fb;
            if (offlineBanner) offlineBanner.style.display = 'flex';
            updateSpeciesNote(true);
            if (fb.length) {
              renderList();
            } else {
              listEl.innerHTML =
                '<p style="color:#c00;font-size:13px;padding:12px 8px;">' +
                '⚠ Could not reach ' + fetchingSpecies.url + '.<br>' +
                'No built-in fallback available for ' + fetchingSpecies.label + '.<br>' +
                'Please check your internet connection and click "Try again".</p>';
            }
          }
        });

      // Wire the "Try again" button once
      var retryBtn = document.getElementById(modal_id + '_retry');
      if (retryBtn && !retryBtn._wired) {
        retryBtn._wired = true;
        retryBtn.addEventListener('click', function(){
          delete allLibrariesBySpecies[currentSpecies.name];
          allLibraries = [];
          fetchLibraries();
        });
      }
    }

    // ── Open / close helpers ─────────────────────────────────────────────────
    function openModal(){
      bd.style.display = 'block';
      searchInput.value = '';
      currentSearch = '';
      // Reset category tabs to All
      currentCat = 'All';
      tabsEl.querySelectorAll('button').forEach(function(b){
        var active = b.getAttribute('data-cat') === 'All';
        b.style.background = active ? '#0d6efd' : '#f8f9fa';
        b.style.color       = active ? '#fff'    : '#333';
      });

      updateSpeciesNote(false);

      if (allLibrariesBySpecies[currentSpecies.name]) {
        allLibraries = allLibrariesBySpecies[currentSpecies.name];
        renderList();
      } else {
        allLibraries = [];
        fetchLibraries();
      }
      setTimeout(function(){ searchInput.focus(); }, 80);
    }

    function closeModal(){
      bd.style.display = 'none';
    }

    // expose openModal so the logo .on('click') above calls it
    d3.select(inst_root + ' .enrichr_logo').on('click', openModal);

  } // end enrichr_icon

  // ── clear_enrichr_results ─────────────────────────────────────────────────

  function clear_enrichr_results(run_resize_viz){

    // Also hide the HTML clear button if the modal exists
    var modal_id = 'enr_modal_' + inst_root.replace(/[^a-zA-Z0-9]/g, '_');
    var clearBtn = document.getElementById(modal_id + '_clear');
    if (clearBtn) clearBtn.style.display = 'none';

    inst_cgm.reset_cats(run_resize_viz);

    d3.select(inst_root+' .enr_title').remove();
    d3.selectAll(inst_root+' .enrichr_bars').remove();

  }

  // ── toggle_enrichr_menu: kept as stub for external callers ───────────────
  function toggle_enrichr_menu(){ /* replaced by HTML modal */ }

  // ── API: post gene list then fetch results ────────────────────────────────

  function get_enr_with_list(ini_gene_list, library, callback_function){

    var gene_list = [];
    _.each(ini_gene_list, function(gene_symbol){
      if (gene_symbol.indexOf(' ') > 0){
        gene_symbol = gene_symbol.split(' ')[0];
      } else if (gene_symbol.indexOf('_') > 0){
        gene_symbol = gene_symbol.split('_')[0];
      }
      gene_list.push(gene_symbol);
    });

    enr_obj.library   = library;
    enr_obj.gene_list = gene_list;

    enr_obj.post_list(gene_list, function(){
      if (typeof callback_function !== 'undefined'){
        enr_obj.get_enr(library, callback_function);
      } else {
        enr_obj.get_enr(library);
      }
    });
  }

  function post_list(gene_list, callback_function){

    var form = new FormData();
    form.append('list', gene_list.join('\n'));
    form.append('description', 'clustergrammer');

    if (typeof callback_function === 'undefined'){
      callback_function = confirm_save;
    }

    fetch(currentSpecies.url + '/addList', {method:'POST', body:form})
      .then(function(res){ return res.text(); })
      .then(function(text){
        var data = JSON.parse(text);
        enr_obj.user_list_id = data.userListId;
        console.log('Enrichr userListId: ' + enr_obj.user_list_id);
        setTimeout(callback_function, 500, data);
      })
      .catch(function(err){
        console.error('Enrichr addList failed:', err);
      });
  }

  function confirm_save(response){
    console.log('saved user_list_id ' + String(enr_obj.user_list_id));
  }

  function get_enr(library, callback_function){

    if (enr_obj.user_list_id !== null){

      var url = currentSpecies.url + '/enrich' +
                '?backgroundType=' + encodeURIComponent(String(library)) +
                '&userListId='     + encodeURIComponent(String(enr_obj.user_list_id));

      fetch(url)
        .then(function(res){
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.text();
        })
        .then(function(text){
          enr_obj.enr_data = JSON.parse(text);
          enr_obj.enr_data_to_cats();
          if (typeof callback_function !== 'undefined'){
            callback_function(enr_obj);
          }
          d3.select(inst_cgm.params.root + ' .enr_wait_circle').remove();
        })
        .catch(function(err){
          console.error('Enrichr enrich failed:', err);
          d3.select(inst_cgm.params.root + ' .enr_wait_circle').remove();
        });

    } else {
      console.log('no user_list_id defined');
    }
  }

  function enrichr_rows(library, callback_function, num_terms){

    enr_obj.library  = library;
    var gene_list    = inst_cgm.params.network_data.row_nodes_names;
    enr_obj.get_enr_with_list(gene_list, library, callback_function);

  }

  function enr_data_to_cats(){

    var library_name = _.keys(this.enr_data)[0];
    var enr_terms    = this.enr_data[library_name];

    enr_terms = enr_terms.slice(0, 10);

    cat_data = [];

    _.each(enr_terms, function(inst_term){
      var inst_data       = {};
      inst_data.cat_title = inst_term[1];
      inst_data.cats      = [];
      inst_data.pval      = inst_term[2];
      inst_data.combined_score = inst_term[4];

      var cat_details     = {};
      cat_details.cat_name = 'true';
      cat_details.members  = inst_term[5];

      inst_data.cats.push(cat_details);
      cat_data.push(inst_data);
    });

    this.cat_data = cat_data;
  }

  // ── Animated wait circle ──────────────────────────────────────────────────

  function make_enr_wait_circle(){
    d3.select(inst_cgm.params.root + ' .viz_svg')
      .append('circle')
      .classed('enr_wait_circle', true)
      .attr('cx', 72).attr('cy', 25).attr('r', 23)
      .style('stroke', '#666').style('stroke-width', '3px')
      .style('fill', 'white').style('fill-opacity', 0).style('opacity', 0);
  }

  function animate_wait(){
    var t = 700;
    d3.select(inst_cgm.params.root + ' .enr_wait_circle')
      .transition().ease('linear').style('opacity', 0.2)
      .transition().ease('linear').duration(t).style('opacity', 0.8)
      .transition().ease('linear').duration(t).style('opacity', 0.2)
      .each('end', animate_wait);
  }

  // ── Update viz with Enrichr results ──────────────────────────────────────

  function update_viz_callback(enr_obj){

    inst_cgm.update_cats(enr_obj.cat_data);

    d3.select(inst_cgm.params.root + ' .enr_title').remove();

    var enr_title = d3.select(inst_cgm.params.root + ' .viz_svg')
      .append('g').classed('enr_title', true)
      .attr('transform', function(){
        var trans = d3.select(inst_cgm.params.root + ' .row_cat_label_container')
                      .attr('transform').split('(')[1].split(')')[0];
        var x_offset = Number(trans.split(',')[0]) - 10;
        return 'translate(' + x_offset + ', 0)';
      });

    enr_title.append('rect')
      .attr('width', inst_cgm.params.viz.cat_room.row).attr('height', 25).attr('fill', 'white');

    enr_title.append('text')
      .attr('transform', 'translate(0,17)')
      .text(enr_obj.library.substring(0, 40).replace(/_/g, ' '))
      .style('font-size', '15px')
      .attr('font-family', '"Helvetica Neue",Helvetica,Arial,sans-serif');

    var extra_y_room = 1.25;
    var unit_length  = extra_y_room * inst_cgm.params.viz.cat_room.symbol_width;
    var bar_width    = unit_length * 0.9;

    d3.selectAll(inst_cgm.params.root + ' .enrichr_bars').remove();

    var bar_height = inst_cgm.params.viz.clust.margin.top - 35;
    var max_score  = enr_obj.cat_data[0].combined_score;
    var bar_scale  = d3.scale.linear().domain([0, max_score]).range([0, bar_height]);

    d3.select(inst_cgm.params.root + ' .row_cat_label_bar_container')
      .selectAll().data(inst_cgm.params.viz.all_cats.row)
      .enter().append('rect')
      .classed('enrichr_bars', true)
      .attr('height', bar_width + 'px').attr('fill', 'red')
      .attr('width', function(d){
        var idx   = d.split('-')[1];
        var score = enr_obj.cat_data[idx].combined_score;
        return bar_scale(score) + 'px';
      })
      .attr('opacity', 0.4)
      .attr('transform', function(d){
        var y = unit_length * (parseInt(d.split('-')[1], 10) - 0.75);
        return 'translate(0,' + y + ')';
      });

  }

  // ── Local enr_obj ─────────────────────────────────────────────────────────

  var enr_obj = {
    user_list_id: null,
    enr_data:     null,
    cat_data:     null,
    get_tries:    0,
    library:      null,
    gene_list:    null,
    enrichr_icon:        enrichr_icon,
    post_list:           post_list,
    get_enr:             get_enr,
    get_enr_with_list:   get_enr_with_list,
    enrichr_rows:        enrichr_rows,
    enr_data_to_cats:    enr_data_to_cats,
    update_viz_callback: update_viz_callback,
    clear_enrichr_results: clear_enrichr_results,
  };

  return enr_obj;

}
