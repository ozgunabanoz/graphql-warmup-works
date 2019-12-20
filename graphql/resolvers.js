const bcrypt = require('bcryptjs');
const validator = require('validator');
const jwt = require('jsonwebtoken');

const User = require('../models/user');
const Post = require('../models/post');
const clearImage = require('../util/file');

module.exports = {
  createUser: async function(args, req) {
    const { email, name, password } = args.userInput;
    const errors = [];

    if (!validator.isEmail(email)) {
      errors.push({ message: 'Invalid email.' });
    }

    if (
      validator.isEmpty(password) ||
      !validator.isLength(password, { min: 5 })
    ) {
      errors.push({ message: 'Password too short.' });
    }

    if (errors.length > 0) {
      const error = new Error('Invalid input.');
      error.data = errors;
      error.code = 422;

      throw error;
    }

    try {
      let existingUser = await User.findOne({
        email
      });

      if (existingUser) {
        const error = new Error('User exists already.');

        throw error;
      }

      let hashedPassword = await bcrypt.hash(password, 12);
      const user = new User({
        email,
        name,
        password: hashedPassword
      });
      let createdUser = await user.save();

      return {
        ...createdUser._doc,
        _id: createdUser._id.toString()
      };
    } catch (err) {
      console.log(err);
    }
  },
  login: async function({ email, password }) {
    try {
      let user = await User.findOne({ email });

      if (!user) {
        const error = new Error('User not found.');
        error.code = 401;

        throw error;
      }

      let isEqual = await bcrypt.compare(password, user.password);

      if (!isEqual) {
        const error = new Error('Incorrect password.');
        error.code = 401;

        throw error;
      }

      let token = jwt.sign(
        {
          userId: user._id.toString(),
          email: user.email
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      return { token, userId: user._id.toString() };
    } catch (err) {
      console.log(err);
    }
  },
  createPost: async function({ postInput }, req) {
    if (!req.isAuth) {
      const error = new Error('Not authenticated!');

      error.code = 401;

      throw error;
    }

    const errors = [];

    if (
      validator.isEmpty(postInput.title) ||
      !validator.isLength(postInput.title, { min: 5 })
    ) {
      errors.push({ message: 'Title is invalid.' });
    }

    if (
      validator.isEmpty(postInput.content) ||
      !validator.isLength(postInput.content, { min: 5 })
    ) {
      errors.push({ message: 'Content is invalid.' });
    }

    if (errors.length > 0) {
      const error = new Error('Invalid input.');

      error.data = errors;
      error.code = 422;

      throw error;
    }

    try {
      let user = await User.findById(req.userId);

      if (!user) {
        const error = new Error('Invalid user.');

        error.code = 401;

        throw error;
      }

      let post = new Post({
        title: postInput.title,
        content: postInput.content,
        imageUrl: postInput.imageUrl,
        creator: user
      });
      let createdPost = await post.save();

      user.posts.push(createdPost);
      await user.save();

      return {
        ...createdPost._doc,
        _id: createdPost._id.toString(),
        createdAt: createdPost.createdAt.toISOString(),
        updatedAt: createdPost.updatedAt.toISOString()
      };
    } catch (err) {
      console.log(err);
    }
  },
  posts: async function({ page }, req) {
    if (!req.isAuth) {
      const error = new Error('Not authenticated!');
      error.code = 401;
      throw error;
    }

    if (!page) {
      page = 1;
    }

    const perPage = 2;

    try {
      const totalPosts = await Post.find().countDocuments();
      const posts = await Post.find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .populate('creator');

      return {
        posts: posts.map(p => {
          return {
            ...p._doc,
            _id: p._id.toString(),
            createdAt: p.createdAt.toISOString(),
            updatedAt: p.updatedAt.toISOString()
          };
        }),
        totalPosts: totalPosts
      };
    } catch (err) {
      console.log(err);
    }
  },
  post: async function({ id }, req) {
    if (!req.isAuth) {
      const error = new Error('Not authenticated!');

      error.code = 401;

      throw error;
    }

    try {
      const post = await Post.findById(id).populate('creator');

      if (!post) {
        const error = new Error('Post not found.');

        error.code = 404;

        throw error;
      }

      return {
        ...post._doc,
        _id: post._id.toString(),
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString()
      };
    } catch (err) {
      console.log(err);
    }
  },
  updatePost: async function({ id, postInput }, req) {
    if (!req.isAuth) {
      const error = new Error('Not authenticated!');

      error.code = 401;

      throw error;
    }

    try {
      const post = await Post.findById(id).populate('creator');

      if (!post) {
        const error = new Error('Post not found.');

        error.code = 401;

        throw error;
      }

      if (post.creator._id.toString() !== req.userId.toString()) {
        const error = new Error('Unauthorized.');

        error.code = 403;

        throw error;
      }

      const errors = [];

      if (
        validator.isEmpty(postInput.title) ||
        !validator.isLength(postInput.title, { min: 5 })
      ) {
        errors.push({ message: 'Title is invalid.' });
      }

      if (
        validator.isEmpty(postInput.content) ||
        !validator.isLength(postInput.content, { min: 5 })
      ) {
        errors.push({ message: 'Content is invalid.' });
      }

      if (errors.length > 0) {
        const error = new Error('Invalid input.');

        error.data = errors;
        error.code = 422;

        throw error;
      }

      post.title = postInput.title;
      post.content = postInput.content;

      if (postInput.imageUrl !== 'undefined') {
        post.imageUrl = postInput.imageUrl;
      }

      const updatedPost = await post.save();

      return {
        ...updatedPost._doc,
        _id: updatedPost._id.toString(),
        createdAt: updatedPost.createdAt.toISOString(),
        updatedAt: updatedPost.updatedAt.toISOString()
      };
    } catch (err) {
      console.log(err);
    }
  },
  deletePost: async function({ id }, req) {
    if (!req.isAuth) {
      const error = new Error('Not authenticated!');

      error.code = 401;

      throw error;
    }

    try {
      const post = await Post.findById(id);

      if (!post) {
        const error = new Error('Post not found.');

        error.code = 401;

        throw error;
      }

      if (post.creator.toString() !== req.userId.toString()) {
        const error = new Error('Unauthorized.');

        error.code = 403;

        throw error;
      }

      clearImage(post.imageUrl);
      await Post.findByIdAndRemove(id);

      const user = await User.findById(req.userId);

      user.posts.pull(id);
      await user.save();
      return true;
    } catch (err) {
      console.log(err);
    }
  },
  user: async function(args, req) {
    if (!req.isAuth) {
      const error = new Error('Not authenticated!');

      error.code = 401;

      throw error;
    }

    try {
      const user = await User.findById(req.userId);

      if (!user) {
        const error = new Error('User not found.');

        error.code = 401;

        throw error;
      }

      return {
        ...user._doc,
        _id: user._id.toString()
      };
    } catch (err) {
      console.log(err);
    }
  },
  updateStatus: async function({ status }, req) {
    if (!req.isAuth) {
      const error = new Error('Not authenticated!');

      error.code = 401;

      throw error;
    }

    try {
      const user = await User.findById(req.userId);

      if (!user) {
        const error = new Error('User not found.');

        error.code = 401;

        throw error;
      }

      user.status = status;

      await user.save();
      return {
        ...user._doc,
        _id: user._id.toString()
      };
    } catch (err) {
      console.log(err);
    }
  }
};
