// Patched: amp.pharm.mssm.edu → maayanlab.cloud for Harmonizome API
function ini_hzome(root_id){

  gene_data = {};

  function get_mouseover(root_tip, gene_symbol){

    if ( d3.select(root_tip + '_row_tip').classed(gene_symbol) ){
     get_request(root_tip, gene_symbol);
    }

  }

  function get_request(root_tip, ini_gene_symbol){

    var gene_symbol;
    if (ini_gene_symbol.indexOf(' ') > 0){
      gene_symbol = ini_gene_symbol.split(' ')[0];
    } else if (ini_gene_symbol.indexOf('_') > 0){
      gene_symbol = ini_gene_symbol.split('_')[0];
    }
    else {
      gene_symbol = ini_gene_symbol;
    }

    // Patched: maayanlab.cloud Harmonizome, using fetch() instead of $.get()
    var base_url = 'https://maayanlab.cloud/Harmonizome/api/1.0/gene/';
    var url = base_url + gene_symbol;

    fetch(url)
      .then(function(res) { return res.text(); })
      .then(function(text) {
        var data = JSON.parse(text);
        gene_data[gene_symbol] = {};
        gene_data[gene_symbol].name = data.name;
        gene_data[gene_symbol].description = data.description;
        set_tooltip(data, root_tip, ini_gene_symbol);
      })
      .catch(function() {
        // gene not found in Harmonizome, skip silently
      });
  }

  function set_tooltip(data, root_tip, gene_symbol){

    if (data.name != undefined){

      d3.selectAll(root_tip + '_row_tip')
        .html(function(){
            var sym_name = gene_symbol + ': ' + data.name;
            var full_html = '<p>' + sym_name + '</p>' +  '<p>' +
              data.description + '</p>';
            return full_html;
        });
    }
  }


  function gene_info(root_tip, gene_info){

    var gene_symbol = gene_info.name;

    if (_.has(gene_data, gene_symbol)){
      var inst_data = gene_data[gene_symbol];
      set_tooltip(inst_data, root_tip, gene_symbol);
    } else{
      setTimeout(get_mouseover, 250, root_tip, gene_symbol);
    }

  }

  hzome = {}

  hzome.gene_info = gene_info;
  hzome.gene_data = gene_data;
  hzome.get_mouseover = get_mouseover;
  hzome.get_request = get_request;

  return hzome;

}
