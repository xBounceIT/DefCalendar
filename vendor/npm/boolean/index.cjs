"use strict";

const boolean = function (value) {
  switch (Object.prototype.toString.call(value)) {
    case "[object String]":
      return ["true", "t", "yes", "y", "on", "1"].includes(value.trim().toLowerCase());
    case "[object Number]":
      return value.valueOf() === 1;
    case "[object Boolean]":
      return value.valueOf();
    default:
      return false;
  }
};

exports.boolean = boolean;
