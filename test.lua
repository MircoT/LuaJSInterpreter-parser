--[[
    Hi, this is some test code. We hope you enjoy.
    Available features are:
    - Function definition and calling;
    - Simple variable definition and calling;
    - Argument passing;
    - Conditional blocks;
    - Simple arithmetic operations;
    - Boolean expressions;
    *** local is not implemented ***
  ]]--

-- Function definition
function inc(n) 
 return n+1
end

function dec(n) 
 return n-1
end

mul = function(a,b)
 return a*b
end

function foo(a,b,c)
  if a or b and c then
    return "OK"
  else
    return "ERROR"
  end
end

--[[recursive factorial function ]]--
function fatt(n)
  if n == 0 then
      return 1
  else
      return n * fatt(n-1)
  end
end

--[[Recursive fibonacci function]]--
function fib(n)
  if n<=2 then
    return 1
  else
    return fib(n-1)+fib(n-2)
  end
end

-- Function calling
a = inc(4) -- 5
b = dec(7) -- 6
c = inc(dec(8)) -- 8
d = mul(3,5) -- 15
TestFactorial_6 = fatt(6) -- 720
testFib_17 = fib(17) -- 1597
testIfBlocks = foo(true,false,true) -- OK
testExpressions1 = foo(true or false,false and true, true ) -- OK
testExpressions2 = inc(inc( mul( mul(3, 5), fib(3)) )) -- ( 15 * 2 ) + 1 + 1 =32

-- Testing boolean expressions
if a==5 and b==6 and c==8 and d == 15 then
 test1 = "OK"
else
 test1 = "ERROR"
end

if 9 ~= 9 then
 test1 = "ERROR"
else
 test2 = "OK"
end
