var _ = require("underscore");

var ParserModule = function(){
    var parsMod = {}; // Real module to export
    
    // PRIVATE ----------------------------------------

    var Token = function(type, value) {
        this.type = type;
        this.value = value;
        this.left = null;
        this.right = null;
    };

    var CheckToken = function(token, t, v){
        // console.log("---CheckToken---");
        // console.log(token);
        // console.log(t);
        // console.log(v);
        // console.log("----------------");
        if(_.isUndefined(token) || _.isNull(token)) return false; // If there's not a next token or next token is null
        else if(_.isArray(v)) return  token.type === t && CheckIn(v)(token.value);
        else if(_.isUndefined(v) && _.isArray(t)) return CheckIn(t)(token.type);
        else return (!_.isUndefined(v)) ? token.type === t && token.value === v : token.type === t;
    };

    /*
     * Returns the first element
     * and deletes it from the passed list.
     * If there's no elements, returns false.
     */
    var Eat_elm = function(list, bottom){
        if(!_.isUndefined(bottom) && list.length > 0) return list.pop();
        return (list.length > 0) ? list.shift() : false;
    };

    var KEYWORDS = ['and', 'break', 'do', 'else', 'elseif',
        'end', 'false', 'for', 'function', 'if',
        'in', 'local', 'nil', 'not', 'or',
        'repeat', 'return', 'then', 'true', 'until', 'while'
    ];

    var OPERATORS = ['+', '-', '*', '/', '%', '^', '#',
        '==', '~=', '<=', '>=', '<', '>', '=',
        '(', ')', '{', '}', '[', ']', '::',
        ';', ':', ',', '.', '..', '...'
    ];

    /* Precedences of operators:
     *
     * 1 : or
     * 2 : and
     * 3 : <     >     <=    >=    ~=    ==
     * 4 : .. 
     * 5 :+     -
     * 6 : *     /     %
     * 7 : not   #     - (unary)
     * 8 : ^
     *
     * NOTE: In cases where two operators of different precedences
     * compete for the same operand, the operand belongs to the 
     * operator with the highest precedence
     *
     * ^ and .. are right associative.
     * unary operators are not left associative.
     * other operators are left associative.
     */

    var OP_VAL = {
        "or": 1,
        "and": 2,
        "<": 3, ">": 3, "<=": 3, ">=": 3, "~=": 3, "==": 3,
        "..": 4,
        "+": 5, "-": 5,
        "*": 6, "/": 6, "%": 6,
        "not": 7, "#": 7, "-U": 7,
        "^": 8
    };

    /*
     * Check precedence of operators
     *
     * If operator is an array, like args for example,
     * source.value will be undefined and the
     * evaluation of the expression return always false
     */
    var Has_precedence = function(source, target){
        // console.log("---Has_precedence---");
        // console.log(source);
        // console.log(target);
        // console.log(OP_VAL[source.value]);
        // console.log(OP_VAL[target.value]);
        // console.log("--------------------");
        return OP_VAL[source.value] < OP_VAL[target.value];
    };

    var TYPES = {
        "number": "NUMBER",
        "keyword": "KEYWORD",
        "identifier": "IDENTIFIER",
        "string": "STRING",
        "operator": "OPERATOR",
        "block": "BLOCK"
    };

    /*
     * Support function to check characters or words
     */
    var CheckIn = function(list){
        return function(w){
            return _.indexOf(list, w) != -1;
        };
    };

    /*
     * Function to check a character
     */
    var is_hex_letter = CheckIn(['a', 'b', 'c', 'd', 'e', 'f', 'A', 'B', 'C', 'D', 'E', 'F']);

    var is_num = function(c){
        return c.charCodeAt(0) >= 48 && c.charCodeAt(0) <= 57;
    };

    var is_letter = function(c){
        return c.charCodeAt(0) >= 65 && c.charCodeAt(0) <= 90 || // A-Z
            c.charCodeAt(0) >= 97 && c.charCodeAt(0) <= 122 || // a-z
            c.charCodeAt(0) == 95; // _ (underscore)
    };

    var is_blank = function(c){
        return c === ' ' || c === '\t' || c === '\n' || c === '';
    };

    var is_newline = function(c){
        return c === '\n' || c === '\r';
    };

    var is_punct = function(c){
        return c.charCodeAt(0) >= 33 && c.charCodeAt(0) <= 47 ||
            c.charCodeAt(0) >= 58 && c.charCodeAt(0) <= 64 ||
            c.charCodeAt(0) >= 91 && c.charCodeAt(0) <= 94 ||
            c.charCodeAt(0) >= 123 && c.charCodeAt(0) <= 126 ||
            c.charCodeAt(0) == 96;
    };

    // KEYWORD check
    var is_keyword = CheckIn(KEYWORDS);

    // OPERATOR check
    var is_operator = CheckIn(OPERATORS);

    // Support buffer for multiline strings
    var multiline_buffer = {
        in_buf: "",
        out_buf: "",
        equal: function(){return this.in_buf === this.out_buf;}
    };

    // Support var for comments
    var comment_started = false;

    /*
     * Tokenizer ----------
     */ 

    /* Finite state machine pattern with js.
     *
     * Reference site: http://www.dofactory.com/javascript-state-pattern.aspx
     *
     * the initial state is a function that change the
     * behavior of the FSM obj, so you can use for other
     * purpoise.
     *
     */
    var FSM_buf_str = function(initial_state, output_obj){ // Finite state machine obj
        // PRIVATE ----------
        var buffer = String();
        var current_state = new initial_state(this);
        var output = output_obj;
        
        // PUBLIC ----------        
        this.update = function(char_){
            buffer = buffer.concat(char_); // Store the character
            current_state.update(char_); // Update the state
            return this; // Enable chaining
        };

        this.transition = function(state){
            current_state = new state(this); // Make the transition
            return this;
        };

        this.output_add = function(cur_char, token_type){
            output.push(
                new Token(
                    /* Check type
                     * 
                     * If the token is an identifier we must check also if
                     * is a keyword.
                     */
                    function(){ 
                        if(token_type === TYPES.identifier){
                            return is_keyword(_.initial(buffer).join("")) ? TYPES.keyword : token_type;
                        }
                        return token_type;
                    }(),
                    _.initial(buffer).join("") // Store the token without the last character
                )
            );
            this.transition(initial_state); // Return to the initial state
            buffer = String(); // Clear buffer
            this.update(cur_char); // Call the update for the current character
        };

        this.get_output = function(){ return output; };

        this.get_initial_buffer = function(char_){ return String(_.initial(buffer).join("")); };

        this.get_buffer = function(char_){ return String(buffer); };

        this.change_buffer = function(new_buf){ buffer = String(new_buf); return this; };

        this.clear_buffer = function(){ buffer = String(); return this; };
    };

    var num_point_ex_neg = function(fsm){
        this.update = function(char_){
            if(is_num(char_)){
                fsm.transition(num_point_ex_neg);
            }
            else{
                if(_.last(fsm.get_initial_buffer()) === "-"){
                    throw "Invalid negative exponent!";
                }
                fsm.output_add(char_, TYPES.number);
            }
        };
    };

    var num_point_ex_final = function(fsm){
        this.update = function(char_){
            if(is_num(char_)){
                fsm.transition(num_point_ex_final);
            }
            else{
                fsm.output_add(char_, TYPES.number);
            }
        };
    };

    var num_point_ex = function(fsm){
        this.update = function(char_){
            if(is_num(char_)){
                fsm.transition(num_point_ex_final);
            }
            else if(char_ === "-"){
                fsm.transition(num_point_ex_neg);
            }
            else{
                if(_.last(fsm.get_initial_buffer()) === "e" ||
                    _.last(fsm.get_initial_buffer()) === "E"){
                        throw "Invalid number with point and exponent!";
                }
                fsm.output_add(char_, TYPES.number);
            }
        };
    };

    var num_point = function(fsm){
        this.update = function(char_){
            if(is_num(char_)){
                fsm.transition(num_point);
            }
            else if((char_ === "e" || char_ === "E") && 
                    _.last(fsm.get_initial_buffer()) !== "."){
                        fsm.transition(num_point_ex);
            }
            else{
                if(_.last(fsm.get_initial_buffer()) === "."){
                    throw "Invalid number with point!";
                }
                fsm.output_add(char_, TYPES.number);
            }
        };
    };

    var num_hex = function(fsm){
        this.update = function(char_){
            if(is_num(char_) || is_hex_letter(char_)){
                fsm.transition(num_hex);
            }
            else{
                if(_.last(fsm.get_initial_buffer()) === "x" || 
                    _.last(fsm.get_initial_buffer()) === "X"){
                        throw "Invalid hexadecimal number!";
                }
                fsm.output_add(char_, TYPES.number);
            }
        };
    };

    var num_start = function(fsm){
        this.update = function(char_){
            if(is_num(char_)){
                fsm.transition(num_start);
            }
            else if(char_ === "x" || char_ === "X"){
                if(fsm.get_initial_buffer() === "0"){
                    fsm.transition(num_hex);
                }
                else{
                    throw "Invalid hexadecimal number!";
                }
            }
            else if(char_ === "."){
                fsm.transition(num_point);
            }
            else{
                fsm.output_add(char_, TYPES.number);
            }
        };
    };

    var letter_start = function(fsm){
        this.update = function(char_){
            if(is_num(char_) || is_letter(char_)){
                fsm.transition(letter_start);
            }
            else{
                fsm.output_add(char_, TYPES.identifier);
            }
        };
    };

    var string_start_apex = function(fsm){
        this.update = function(char_){
            if(char_ !== "\'"){
                fsm.transition(string_start_apex);
            }
            else{
                fsm.output_add("", TYPES.string);
            }
        };
    };

    var string_start_quote = function(fsm){
        this.update = function(char_){
            if(char_ === "\n"){
                throw "String inline haven't newline";
            }
            else if(char_ !== "\""){
                fsm.transition(string_start_quote);
            }
            else{
                fsm.output_add("", TYPES.string);
            }
        };
    };

    var string_multi_tail = function(fsm){
        this.update = function(char_){
            if(char_ === '='){
                multiline_buffer.out_buf = multiline_buffer.out_buf.concat(char_);
                fsm.transition(string_multi_tail);
            }
            else if(char_ === ']'){
                if(multiline_buffer.equal()){
                    fsm.change_buffer(
                        _.initial(fsm.get_buffer(), multiline_buffer.out_buf.length + 1).join("")
                    );
                    if(comment_started){
                        comment_started = false;
                        fsm.clear_buffer().transition(lua_tok_init);
                    }
                    else{
                        fsm.output_add("", TYPES.string); // last parenthesis is lost
                    }
                }
                else{
                    throw "Multiline string with equals error!";
                }
            }
            else{
                multiline_buffer.out_buf = String();
                fsm.transition(string_multi_body);
            }
        };
    };

    var string_multi_body = function(fsm){
        this.update = function(char_){
            if(char_ !== ']'){
                fsm.transition(string_multi_body);
            }
            else{
                fsm.transition(string_multi_tail);
            }
        };
    };

    var string_multi_start = function(fsm){
        this.update = function(char_){
            if(char_ === '='){
                multiline_buffer.in_buf = multiline_buffer.in_buf.concat(char_);
                fsm.transition(string_multi_start);
            }
            else if(char_ === '['){
                fsm.transition(string_multi_body).clear_buffer();
            }
            else{
                throw "Multi string start error!";
            }
        };
    };

    var comment_start = function(fsm){
        this.update = function(char_){
            if(char_ === '\n'){
                fsm.transition(lua_tok_init).clear_buffer();
            }
            else if(char_ === '['){
                if(fsm.get_initial_buffer() !== "--"){
                    throw "Wrong multiline comment";
                }
                comment_started = true;
                fsm.transition(operator_start).clear_buffer().update(char_);
            }
            else{
                fsm.transition(comment_start);
            }
        };
    };

    var operator_start = function(fsm){
        this.update = function(char_){
            if(char_ === '-' && fsm.get_initial_buffer() === '-'){
                fsm.transition(comment_start);
            }
            else if(is_operator(fsm.get_buffer())){
                fsm.transition(operator_start);
            }
            else if(char_ === '=' && fsm.get_initial_buffer() === '['){
                multiline_buffer.in_buf = String();
                multiline_buffer.out_buf = String();
                multiline_buffer.in_buf = multiline_buffer.in_buf.concat(char_);
                fsm.transition(string_multi_start).clear_buffer();
            }
            else if(char_ === '[' && fsm.get_initial_buffer() === '['){
                multiline_buffer.in_buf = String();
                multiline_buffer.out_buf = String();
                fsm.transition(string_multi_body).clear_buffer();
            }
            else{
                fsm.output_add(char_, TYPES.operator);
            }
        };
    };

    var punct_start = function(fsm){
        this.update = function(char_){
            if(char_ === "\n"){
                throw "String inline haven't newline";
            }
            else if(char_ === '\"'){
                fsm.transition(string_start_quote).clear_buffer();
            }
            else if(char_ === '\''){
                fsm.transition(string_start_apex).clear_buffer();
            }
            else{
                if(is_operator(fsm.get_buffer()) ||
                    fsm.get_buffer() === "~"){
                        fsm.transition(operator_start);
                }
                else{
                    throw "Operator error!";
                }
            }
        };
    };

    var lua_tok_init = function(fsm){
        this.update = function(char_){
            if(is_num(char_)){
                fsm.transition(num_start);
            }
            else if(is_letter(char_)){
                fsm.transition(letter_start);
            }
            else if(is_punct(char_)){
                fsm.transition(punct_start).clear_buffer().update(char_);
            }
            else if(is_blank(char_)){
                fsm.transition(lua_tok_init).clear_buffer();
            }
            else{
                throw "Unrecognized character: \"" + char_ + "\"";
            }
        };
    };

    /*
     * Tree creation (parser) ----------
     */

    var CheckSemicolon = function(tokens){
        if(CheckToken(_.first(tokens), TYPES.operator, ";")){
                Eat_elm(tokens); // We drop the semicolon because in lua is optional
        }
    };

    var Block = function(tokens){
        var block = Array();
        var chunk;

        this.create = function(){
            if(!_.isEmpty(tokens)){
                chunk = Chunk(tokens);
                if(chunk){
                    block.push(chunk);
                }
                else{
                    return block;
                }
                this.create();
            }
            return block;
        };

        return this.create();
    };

    var Chunk = function(tokens){
        var laststat;

        // laststat
        laststat = Laststat(tokens);
        if(laststat){
            return laststat;
        }
        stat = Stat(tokens);
        if(stat){
            return stat;
        }
        return false;
    };

    var Stat = function(tokens){
        var root = null;
        var cur_list, exp, block, tmp;

        if(CheckToken(_.first(tokens), TYPES.keyword, ["end", "elseif", "else"])){
            return root;
        }
        else if(CheckToken(_.first(tokens), TYPES.keyword, "if")){
            root = Eat_elm(tokens); // Get if keyword
            exp = Explist(tokens);
            if(_.isNull(exp)){
                throw "If statement need an expression condition!";
            }
            root.left = exp;
            // Get then
            if(CheckToken(_.first(tokens), TYPES.keyword, "then")){
                root.right = Eat_elm(tokens);
            }
            else{
                throw "Missing then keyword!";
            }
            tmp = root.right;
            block = Block(tokens);
            tmp.left = block;
            if(CheckToken(_.first(tokens), TYPES.keyword, "end")){
                Eat_elm(tokens); // We drop the end keyword
            }
            else{
                (function elseif_stat(){
                    if(CheckToken(_.first(tokens), TYPES.keyword, "elseif")){
                        tmp.right = Eat_elm(tokens);  // Get elseif keyword
                        exp = Explist(tokens);
                        if(_.isNull(exp)){
                            throw "Elseif statement need an expression condition!";
                        }
                        tmp = tmp.right;
                        tmp.left = exp;
                        if(CheckToken(_.first(tokens), TYPES.keyword, "then")){
                            tmp.right = Eat_elm(tokens);
                        }
                        else{
                            throw "Missing then keyword!";
                        }
                        block = Block(tokens);
                        tmp = tmp.right;
                        tmp.left = block;
                        if(CheckToken(_.first(tokens), TYPES.keyword, "end")){
                            return;
                        }
                        else if(CheckToken(_.first(tokens), TYPES.keyword, "else")){
                            return;
                        }
                        else{
                            throw "Wrong ending of the elsif statement!";
                        }
                        elseif_stat();
                    }
                    else return;
                })();
            }
            if(CheckToken(_.first(tokens), TYPES.keyword, "end")){
                Eat_elm(tokens); // We drop the end keyword
            }
            else if(CheckToken(_.first(tokens), TYPES.keyword, "else")){
                        tmp.right = Eat_elm(tokens);  // Get else keyword
                        tmp = tmp.right;
                        block = Block(tokens);
                        tmp.left = block;
                        if(CheckToken(_.first(tokens), TYPES.keyword, "end")){
                            Eat_elm(tokens); // We drop the end keyword
                        }
                        else{
                            throw "Wrong ending of the else statement!";
                        }
            }
        }
        else if(CheckToken(_.first(tokens), TYPES.identifier) &&
            !CheckToken(_.first(tokens, 2)[1], TYPES.operator, "(")){  // Varlist
                cur_list = Varlist(tokens);
                if(CheckToken(_.first(tokens), TYPES.operator, "=")){
                    root = Eat_elm(tokens);
                    root.left = cur_list;
                    // Check function assignment
                    if(CheckToken(_.first(tokens), TYPES.keyword, "function") &&  // Function declaration
                        CheckToken(_.first(tokens, 2)[1], TYPES.operator, "(")){
                            tmp = Eat_elm(tokens);  // Eat function keyword
                            exp = Explist(tokens);
                            tmp.left = exp;
                            block = Block(tokens);
                            tmp.right = block;
                            root.right = tmp;
                            if(CheckToken(_.first(tokens), TYPES.keyword, "end")){
                                Eat_elm(tokens); // We drop the end keyword
                            }
                            else{
                                throw "Wrong ending of the function '" + root.left.value + "' !";
                            }
                    }
                    else if(CheckToken(_.first(tokens), TYPES.identifier) &&  // Function call
                             CheckToken(_.first(tokens, 2)[1], TYPES.operator, "(")){
                                tmp = Eat_elm(tokens);  // Eat function name
                                exp = Explist(tokens);
                                // console.log("explist", exp)
                                tmp.left = exp;
                                root.right = tmp;
                    }
                    else{
                        exp = Explist(tokens);
                        if(_.isNull(exp)){
                            throw "Wrong explist in varlist assignment!";
                        }
                        root.right = exp;
                    }
                }
                else{
                    throw "Wrong assignment of varlist!";
                }
        }
        else if(CheckToken(_.first(tokens), TYPES.identifier) &&
                 CheckToken(_.first(tokens, 2)[1], TYPES.operator, "(")){
                    root = Eat_elm(tokens);
                    exp = Explist(tokens);
                    root.left = exp;
        }
        else if(CheckToken(_.first(tokens), TYPES.keyword, "function")){
                root = Eat_elm(tokens);  // Eat function keyword
                root.left = Array();
                if(CheckToken(_.first(tokens), TYPES.identifier)){
                    root.left.push(Eat_elm(tokens));
                    if(!CheckToken(_.first(tokens), TYPES.operator, "(")){
                        throw "Function need arguments!";
                    }
                    exp = Explist(tokens);
                    block = Block(tokens);
                    root.left.push(exp);
                    root.right = block;
                    if(CheckToken(_.first(tokens), TYPES.keyword, "end")){
                        Eat_elm(tokens); // We drop the end keyword
                    }
                    else{
                        throw "Wrong ending of the function '" + root.value + "' !";
                    }
                }
                else{
                    throw "Wrond declaration of a function!";
                }
        }

        if(!_.isNull(root)){
            CheckSemicolon(tokens);
            return root;
        }
        else{
            return false;
        }
    };

    var Varlist = function(tokens){
        var root = null;
        var varlist, comma, new_varlist;

        varlist = Var(tokens);
        root = varlist;

        if(varlist && CheckToken(_.first(tokens), TYPES.operator, ",")){
                comma = Eat_elm(tokens);
                new_varlist = Varlist(tokens);
                comma.right = new_varlist;
                comma.left = varlist;
                root = comma;
        }

        return root;
    };

    var Var = function(tokens){
        if(CheckToken(_.first(tokens), TYPES.identifier)){
            return Eat_elm(tokens);
        }
        else{
            throw "Not a var in varlist!";
        }
    };

    var Laststat = function(tokens){
        var root = null;
        var cur_tok, exp;

        if(CheckToken(_.first(tokens), TYPES.keyword, "break")){
            cur_tok = Eat_elm(tokens);
            root = cur_tok;
        }
        else if(CheckToken(_.first(tokens), TYPES.keyword, "return")){
            cur_tok = Eat_elm(tokens);
            exp = Explist(tokens);
            root = cur_tok;
            root.left = exp;
        }

        if(!_.isNull(root)){
            CheckSemicolon(tokens);
            return root;
        }
        else{
            return false;
        }
    };

    var Explist = function(tokens){
        var root = null;
        var explist, comma, new_explist;

        explist = Exp(tokens);
        root = explist;
        // console.log("explist", explist)

        if(explist && CheckToken(_.first(tokens), TYPES.operator, ",")){
                comma = Eat_elm(tokens);
                new_explist = Explist(tokens);
                comma.right = new_explist;
                comma.left = explist;
                root = comma;
        }
        else if(explist && CheckToken(_.first(tokens), TYPES.operator, ")")){
            Eat_elm(tokens);  // Discard parentesis
        }

        return root;
    };

    /*
     * Check if a token is a variable
     */
    var isVar = function(token, tokens){
        if(CheckToken(token, TYPES.number) ||
            CheckToken(token, TYPES.string) ||
             CheckToken(token, TYPES.identifier) ||
              CheckToken(token, TYPES.keyword, ["true", "false", "nil"]))
                return true;
        else
            return false;
    };

    var Exp = function(tokens){
        var tree_root = null;
        var tmp = null;
        var tmp_pit = Array();
        var output = Array();  // output stack for RPN
        var stack = Array();  // Operator stack and support stack
        var last_type = undefined;

        /*
         * Check last element inserted
         */ 
        var last_elm_check = function(){
            if(_.isUndefined(last_type)) return true;
            else if((last_type === TYPES.number ||
                     last_type === TYPES.identifier ||
                     last_type === TYPES.string ||
                     last_type === TYPES.block) &&
                      CheckToken(_.first(tokens), [TYPES.number,
                                                   TYPES.identifier,
                                                   TYPES.string,
                                                   TYPES.block]))
                        return false;
            return true;
        };

        /*
         * Convert an expression to RPN (Reverse polish notation)
         * and then makes a tree
         *
         * NOTE: http://en.wikipedia.org/wiki/Shunting-yard_algorithm
         */
        var shunting_yard_to_tree = function(){
            output = shunting_yard();
            /*console.log("--- Tokens -----");
            console.log(tokens);
            console.log("OUTPUT -----");
            console.log(_.map(output, function(elm){ return (_.isArray(elm)) ? "Args" : elm.value;}));
            console.log("STACK -----");
            console.log(_.map(stack, function(elm){ return elm.value;}));*/
            return make_tree();
        };

        /*
         * Create tree from RPN (Reverse polish notation) output
         */
        var make_tree = function(){
            (function create_tree(){
                if(_.isEmpty(output)) return;
                else if(_.isArray(_.first(output)) || isVar(_.first(output))){  // Also args are operands
                    stack.push(Eat_elm(output));
                }
                else if(CheckToken(_.first(output), TYPES.operator, "-U")){
                    tmp = Eat_elm(output);
                    tmp.value = "-";
                    tmp.left = Eat_elm(stack, "bottom");
                    stack.push(tmp);
                }
                else if(CheckToken(_.first(output), TYPES.operator, "#") ||
                         CheckToken(_.first(output), TYPES.keyword, "not")){
                            tmp = Eat_elm(output);
                            tmp.left = Eat_elm(stack, "bottom");
                            stack.push(tmp);
                }
                else{
                    tmp = Eat_elm(output);
                    /*
                     * The order is the opposite because we go 
                     * from left to righ in our data structure
                     */
                    var first = Eat_elm(stack, "bottom");
                    var second = Eat_elm(stack, "bottom");
                    tmp.left = second;
                    tmp.right = first;
                    stack.push(tmp);
                    tree_root = tmp;
                }
                create_tree();
            })();
            if(_.isNull(tree_root) && !_.isEmpty(stack)){
                tree_root = Eat_elm(stack);  // There's only one element in the stack
            }
            return tree_root;
        };

        /*
         * Create RPN (Reverse polish notation) output
         */
        var shunting_yard = function(){
            if(!last_elm_check()){  // Check if an explist is ended
                return;
            }
            else{
                last_type = (_.first(tokens)) ? _.first(tokens).type : undefined;
            }
            if(isVar(_.first(tokens), tokens)){  // Is a variable
                tmp = Eat_elm(tokens);
                if(CheckToken(_.first(tokens), TYPES.operator, "(")){
                    tmp_pit = Array();
                    /*
                     * Pass to the args of the function only a part of the tokens,
                     * exactly the part between the parenthesis, because the rest
                     * is needed for the main explist.
                     */
                    (function fill(pit, my_tokens){
                        var count = 0;
                        return (function eat_all(){
                            if(CheckToken(_.first(my_tokens), TYPES.operator, "(")) count += 1;
                            else if(CheckToken(_.first(my_tokens), TYPES.operator, ")")) count -= 1;
                            pit.push(Eat_elm(my_tokens));
                            if(count === 0) return pit;
                            eat_all();
                        })();
                    })(tmp_pit, tokens);
                    tmp.left = Explist(tmp_pit);
                }
                output.push(tmp);
                shunting_yard();
            }
            else if(CheckToken(_.first(tokens), TYPES.operator, "(")){
                Eat_elm(tokens);  // Discard parentesis
                tmp = Array();
                tmp.push(Explist(tokens));
                stack.push(tmp);
                last_type = TYPES.block;
                shunting_yard();
            }
            else if(CheckToken(_.first(tokens), TYPES.operator, ")")){
                return;
            }
            else if(CheckToken(_.first(tokens), TYPES.operator, ['+', '-', '-U', '*', '/', '%', '^', '#', '==', '~=', '<=', '>=', '<', '>', '=', '..', '...']) ||
                     CheckToken(_.first(tokens), TYPES.keyword, ["and", "or", "not"])){
                        if(_.isEmpty(stack)){
                            stack.push(Eat_elm(tokens));
                            shunting_yard();
                        }
                        else if(Has_precedence(_.last(stack), _.first(tokens))){
                            stack.push(Eat_elm(tokens));
                            shunting_yard();
                        }
                        else{
                            // console.log("PRECEDENCE!!!");
                            (function clean_stack(){
                                if(_.isEmpty(stack) ||
                                   Has_precedence(_.last(stack), _.first(tokens)))
                                        return;
                                else{
                                    output.push(Eat_elm(stack, "bottom"));
                                    clean_stack();
                                }
                            })();
                            stack.push(Eat_elm(tokens));
                            shunting_yard();
                        }
            }
            (function clean_stack(){
                if(_.isEmpty(stack)) return;
                else{
                    output.push(Eat_elm(stack, "bottom"));
                    clean_stack();
                }
            })();
            return output;
        };

        return shunting_yard_to_tree();
    };

    // PUBLIC ----------------------------------------
    parsMod.Parser = function(){
        this.getTokens = function(text){
            // First convert all newline in \n and split every character
            var characters = String(text.replace(/(\r\n|\r)/gm,"\n")+"\n").split('');
            var output = Array();
            var tokens_fsm = new FSM_buf_str(lua_tok_init, output);

            _.each(
                characters,
                function(value, key, list){
                    tokens_fsm.update(value);
                }
            );
            
            return tokens_fsm.get_output();
        };

        this.getTree = function(tokens_list){
            if(_.isString(tokens_list)){
                tokens_list = this.getTokens(tokens_list);
            }

            // Check for unary minus
            _.each(tokens_list, function(elm, index, list){
                if(CheckToken(elm, TYPES.operator, "-") &&
                    !isVar(list[index - 1]))
                        elm.value = elm.value.concat("U");
            });

            var tree = new Block(tokens_list);

            return tree;
        };

    };

    return parsMod;

}();

// Exporting -----
if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports)
        module.exports = ParserModule;
    exports._s = ParserModule;
}

if(process.argv.length > 2){
    var fs = require('fs'),
        luaText = process.argv[2],
        filename;
    if(luaText.split(".lua").length === 1){
        console.log("Error: arg is not a lua file...");
        return;
    }
    else{
        filename = luaText.split(".lua")[0];
    }
    var lex = new ParserModule.Parser();
    if(fs.existsSync(luaText)){
        luaText = fs.readFileSync(luaText).toString();
    }
    var result = lex.getTree(luaText);
    fs.writeFile(filename.concat("_output.json"), JSON.stringify(result, null, 4), function(err) {
        if(err) {
            console.log(err);
        } else {
            console.log("!!!The file was saved!!!");
        }
    });
}